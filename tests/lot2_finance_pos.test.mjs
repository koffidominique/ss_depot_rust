import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot2-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(tmpDir, 'lot2_test.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(tmpDir, 'Sauvegardes');

const domain = await import('../server/domain.ts');
const { calculateSaleCart, computeExactLineGrossFcfa, parseQtyInputToMilliBigInt } = await import(
  '../src/features/sales/utils/saleCalculations.ts'
);
const { createApiApp } = await import('../server/app.ts');
const { closeDb } = await import('../server/db.ts');

let server;
let baseUrl = '';
let authToken = '';

async function api(method, endpoint, body, token = authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

describe('LOT 2 — Calculs financiers exacts, POS BigInt et caisse/consignes', () => {
  let categoryId = 0;
  let intProdId = 0;
  let intPkgId = 0;
  let fracProdId = 0;
  let fracPkgId = 0;
  let depositProdId = 0;
  let depositPkgId = 0;
  let limitedClientId = 0;

  before(async () => {
    const app = createApiApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const setup = await api('POST', '/api/auth/setup', { pin: '246810' }, '');
    assert.equal(setup.status, 200);
    authToken = setup.data.token;

    const openCash = await api('POST', '/api/cash/open', {
      opening_cash: 15_000,
      request_key: 'lot2-cash-open',
    });
    assert.equal(openCash.status, 201);

    const cats = await api('GET', '/api/categories');
    categoryId = cats.data[0].id;

    // Emballage consigné (casier 24 alvéoles à 2 400 FCFA)
    const retType = await api('POST', '/api/consignments/types', {
      code: 'CAS-LOT2',
      name: 'Casier Lot 2',
      producer: 'SOLIBRA',
      kind: 'crate',
      deposit_value: 2_400,
      initial_stock: 20,
    });
    assert.equal(retType.status, 201);

    // Produit entier (allow_fraction = false)
    const pInt = await api('POST', '/api/products', {
      name: 'Bière Entière Lot 2',
      category_id: categoryId,
      base_unit: 'bouteille',
      initial_stock: '100',
      min_stock: '5',
      retail_price: 500,
      packagings: [
        {
          name: 'bouteille',
          coefficient: '1',
          retail_price: 500,
          wholesale_price: 450,
          semi_wholesale_price: 480,
          allow_fraction: false,
          deposit_mode: 'none',
        },
      ],
    });
    assert.equal(pInt.status, 201);
    intProdId = pInt.data.id;
    const listInt = await api('GET', `/api/products?search=${encodeURIComponent('Bière Entière Lot 2')}`);
    intPkgId = listInt.data.items.find((p) => p.id === intProdId).packagings[0].id;

    // Produit fractionnable (allow_fraction = true, prix 100 FCFA par litre / kg)
    const pFrac = await api('POST', '/api/products', {
      name: 'Sirop Vrac Lot 2',
      category_id: categoryId,
      base_unit: 'litre',
      initial_stock: '100',
      min_stock: '5',
      retail_price: 100,
      packagings: [
        {
          name: 'bouteille',
          coefficient: '1',
          retail_price: 100,
          wholesale_price: 90,
          semi_wholesale_price: 95,
          allow_fraction: true,
          deposit_mode: 'none',
        },
      ],
    });
    assert.equal(pFrac.status, 201);
    fracProdId = pFrac.data.id;
    const listFrac = await api('GET', `/api/products?search=${encodeURIComponent('Sirop Vrac Lot 2')}`);
    fracPkgId = listFrac.data.items.find((p) => p.id === fracProdId).packagings[0].id;

    // Produit consigné
    const pDep = await api('POST', '/api/products', {
      name: 'Casier Consigné Lot 2',
      category_id: categoryId,
      base_unit: 'bouteille',
      initial_stock: '240',
      min_stock: '24',
      retail_price: 500,
      packagings: [
        {
          name: 'casier',
          coefficient: '24',
          retail_price: 12_000,
          wholesale_price: 11_000,
          semi_wholesale_price: 11_500,
          allow_fraction: false,
          deposit_mode: 'deposit',
          components: [{ returnable_id: retType.data.id, pieces_per_pack: 1 }],
        },
      ],
    });
    assert.equal(pDep.status, 201);
    depositProdId = pDep.data.id;
    const listDep = await api('GET', `/api/products?search=${encodeURIComponent('Casier Consigné Lot 2')}`);
    depositPkgId = listDep.data.items.find((p) => p.id === depositProdId).packagings[0].id;

    const cli = await api('POST', '/api/clients', {
      name: 'Client Plafonné Lot 2',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 10_000,
      payment_terms_days: 15,
    });
    assert.equal(cli.status, 201);
    limitedClientId = cli.data.id;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Domaine exact : montants entiers, nuls, négatifs, overflow, milli-unités et multiplications exactes/refusées', () => {
    // Montant entier, nul, négatif, overflow
    assert.equal(domain.fcfa(0), 0);
    assert.equal(domain.nonNegativeFcfa(0), 0);
    assert.throws(() => domain.positiveFcfa(0));
    assert.throws(() => domain.nonNegativeFcfa(-1));
    assert.throws(() => domain.fcfa(12.5));
    assert.throws(() => domain.checkedAddMoney(Number.MAX_SAFE_INTEGER, 1));
    assert.throws(() => domain.checkedMulMoney(Number.MAX_SAFE_INTEGER, 2));
    assert.throws(() => domain.checkedSubNonNegativeMoney(500, 600));

    // Quantités : entière, fractionnaire autorisée, > 3 décimales refusée
    assert.equal(domain.toMilli('2'), 2000);
    assert.equal(domain.toMilli('1.5'), 1500);
    assert.equal(domain.toMilli('0,250'), 250);
    assert.throws(() => domain.toMilli('1.2345'));
    assert.throws(() => domain.toMilli('1.'));
    assert.throws(() => domain.toMilli('.5'));
    assert.throws(() => domain.positiveMilli('0'));
    assert.throws(() => domain.positiveMilli('-1'));

    // Multiplication exacte vs non représentable en FCFA
    assert.equal(domain.computeLineTotalFcfa(500, 100), 50); // 0.5 * 100 = 50 FCFA exact
    assert.throws(() => domain.computeLineTotalFcfa(333, 100)); // 33.3 FCFA refusé
    assert.throws(() => domain.multiplyQtyCoeffToBaseMilli(1, 500)); // 0.0005 refusé
  });

  it('Module POS React (saleCalculations.ts) : BigInt sans arrondi et parité stricte avec Node', () => {
    const parsed = parseQtyInputToMilliBigInt('1,250');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.milli, 1250n);
      const exactLine = computeExactLineGrossFcfa(parsed.milli, 1000n);
      assert.equal(exactLine.ok, true);
      if (exactLine.ok) assert.equal(exactLine.amount, 1250n);
    }

    // Multiplication produisant fraction de FCFA refusée sans arrondi
    const badCart = calculateSaleCart(
      [
        {
          key: 'frac-bad',
          productName: 'Sirop Vrac Lot 2',
          packagingName: 'bouteille',
          coefficientMilli: 1000,
          allowFraction: true,
          quantity: '0.333',
          unitPrice: 100,
          discountAmount: 0,
          depositPerPack: 0,
          depositMode: 'none',
        },
      ],
      0
    );
    assert.equal(badCart.isValid, false);
    assert.equal(badCart.grandTotal, null);
    assert.equal(badCart.lineResults['frac-bad'].valid, false);
    assert.equal(badCart.lineResults['frac-bad'].lineNet, null);

    // Fraction interdite sur emballage entier / consigné
    const disallowedFrac = calculateSaleCart(
      [
        {
          key: 'dep-bad',
          productName: 'Casier Consigné Lot 2',
          packagingName: 'casier',
          coefficientMilli: 24000,
          allowFraction: true,
          quantity: '1.5',
          unitPrice: 12000,
          discountAmount: 0,
          depositPerPack: 2400,
          depositMode: 'deposit',
        },
      ],
      0
    );
    assert.equal(disallowedFrac.isValid, false);
    assert.equal(disallowedFrac.grandTotal, null);

    // Remise égale au montant (total 0 -> rejeté car vente > 0 exigée) & remise > montant rejetée
    const eqDisc = calculateSaleCart(
      [
        {
          key: 'eq',
          productName: 'Bière Entière Lot 2',
          packagingName: 'bouteille',
          coefficientMilli: 1000,
          allowFraction: false,
          quantity: '2',
          unitPrice: 500,
          discountAmount: 0,
          depositPerPack: 0,
          depositMode: 'none',
        },
      ],
      1000
    );
    assert.equal(eqDisc.isValid, false);
    assert.equal(eqDisc.netMerch, 0);

    const overDisc = calculateSaleCart(
      [
        {
          key: 'over',
          productName: 'Bière Entière Lot 2',
          packagingName: 'bouteille',
          coefficientMilli: 1000,
          allowFraction: false,
          quantity: '2',
          unitPrice: 500,
          discountAmount: 0,
          depositPerPack: 0,
          depositMode: 'none',
        },
      ],
      1200
    );
    assert.equal(overDisc.isValid, false);
    assert.equal(overDisc.grandTotal, null);

    // Dépassement MAX_SAFE_INTEGER signalé sans silence
    const overflowCart = calculateSaleCart(
      [
        {
          key: 'ovf',
          productName: 'Bière Entière Lot 2',
          packagingName: 'bouteille',
          coefficientMilli: 1000,
          allowFraction: false,
          quantity: '10000000000',
          unitPrice: 9007199,
          discountAmount: 0,
          depositPerPack: 0,
          depositMode: 'none',
        },
      ],
      0
    );
    assert.equal(overflowCart.isValid, false);
    assert.equal(overflowCart.grandTotal, null);
  });

  it('Parité backend Node ↔ React POS : ventes exactes, remises, paiements mixtes, fractions, crédit et caisse', async () => {
    // 1. Fraction autorisée produisant un entier FCFA (0.5 * 100 = 50 FCFA) + produit entier + consigne
    const posItems = [
      {
        key: 'frac-ok',
        productName: 'Sirop Vrac Lot 2',
        packagingName: 'bouteille',
        coefficientMilli: 1000,
        allowFraction: true,
        quantity: '0.5',
        unitPrice: 100,
        discountAmount: 0,
        depositPerPack: 0,
        depositMode: 'none',
      },
      {
        key: 'dep-ok',
        productName: 'Casier Consigné Lot 2',
        packagingName: 'casier',
        coefficientMilli: 24000,
        allowFraction: false,
        quantity: '1',
        unitPrice: 12000,
        discountAmount: 50,
        depositPerPack: 2400,
        depositMode: 'deposit',
      },
    ];
    const reactCalc = calculateSaleCart(posItems, 50, [
      { method_code: 'cash', amount: 10_000 },
      { method_code: 'wave', amount: 4_350 },
    ]);
    // 50 + (12000 - 50) = 12000 subtotalMerch ; -50 global = 11950 netMerch ; +2400 deposit = 14350 grandTotal
    assert.equal(reactCalc.isValid, true);
    assert.equal(reactCalc.subtotalMerch, 12_000);
    assert.equal(reactCalc.netMerch, 11_950);
    assert.equal(reactCalc.totalDeposit, 2_400);
    assert.equal(reactCalc.grandTotal, 14_350);
    assert.equal(reactCalc.paidTotal, 14_350);

    const apiSale = await api('POST', '/api/sales', {
      request_key: 'lot2-parity-sale-1',
      client_id: limitedClientId,
      sale_type: 'cash',
      price_tier: 'retail',
      discount_amount: 50,
      lines: [
        { product_id: fracProdId, packaging_id: fracPkgId, quantity: '0.5', discount_amount: 0 },
        { product_id: depositProdId, packaging_id: depositPkgId, quantity: '1', discount_amount: 50 },
      ],
      payments: [
        { method_code: 'cash', amount: 10_000 },
        { method_code: 'wave', amount: 4_350 },
      ],
    });
    assert.equal(apiSale.status, 201);
    assert.equal(apiSale.data.subtotal_merchandise, reactCalc.subtotalMerch);
    assert.equal(apiSale.data.total_merchandise, reactCalc.netMerch);
    assert.equal(apiSale.data.total_deposit, reactCalc.totalDeposit);
    assert.equal(apiSale.data.total_amount, reactCalc.grandTotal);
    assert.equal(apiSale.data.paid_amount, reactCalc.paidTotal);

    // 2. Rejets exacts côté backend : fraction interdite, fraction FCFA, > 3 décimales, remise > montant, paiement insuffisant
    const badFracForbidden = await api('POST', '/api/sales', {
      request_key: 'lot2-bad-frac-1',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: intProdId, packaging_id: intPkgId, quantity: '1.5' }],
      payments: [{ method_code: 'cash', amount: 750 }],
    });
    assert.equal(badFracForbidden.status, 400);

    const badFracMoney = await api('POST', '/api/sales', {
      request_key: 'lot2-bad-frac-money',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: fracProdId, packaging_id: fracPkgId, quantity: '0.333' }],
      payments: [{ method_code: 'cash', amount: 33 }],
    });
    assert.equal(badFracMoney.status, 400);

    const badOver3Dec = await api('POST', '/api/sales', {
      request_key: 'lot2-bad-4dec',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: fracProdId, packaging_id: fracPkgId, quantity: '1.2345' }],
      payments: [{ method_code: 'cash', amount: 123 }],
    });
    assert.equal(badOver3Dec.status, 400);

    const badOverDiscount = await api('POST', '/api/sales', {
      request_key: 'lot2-bad-disc',
      sale_type: 'cash',
      price_tier: 'retail',
      discount_amount: 600,
      lines: [{ product_id: intProdId, packaging_id: intPkgId, quantity: '1' }],
      payments: [{ method_code: 'cash', amount: 500 }],
    });
    assert.equal(badOverDiscount.status, 400);

    const badUnderpaid = await api('POST', '/api/sales', {
      request_key: 'lot2-underpaid',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: intProdId, packaging_id: intPkgId, quantity: '2' }],
      payments: [{ method_code: 'cash', amount: 900 }],
    });
    assert.equal(badUnderpaid.status, 400);

    // 3. Crédit avec plafond dépassé (plafond 10 000 FCFA, reste à crédit 10 500 -> refusé)
    const badCreditLimit = await api('POST', '/api/sales', {
      request_key: 'lot2-over-credit',
      client_id: limitedClientId,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: intProdId, packaging_id: intPkgId, quantity: '21' }],
      payments: [],
    });
    assert.equal(badCreditLimit.status, 400);
    assert.equal(badCreditLimit.data.code, 'CREDIT_LIMIT_EXCEEDED');

    // 4. Dépense / remboursement supérieur aux espèces disponibles en caisse (espèces = 15000 + 10000 = 25000)
    const badCashRefund = await api('POST', '/api/expenses', {
      request_key: 'lot2-bad-expense',
      category: 'Divers',
      amount: 30_000,
      method_code: 'cash',
      beneficiary: 'Test',
    });
    assert.equal(badCashRefund.status, 400);

    // Retour consignation dépassant espèces ou valeur consignée
    const depositIssueId = apiSale.data.deposits[0].id;
    const badDepositOverValue = await api('POST', '/api/consignments/returns', {
      issue_id: depositIssueId,
      pieces: 1,
      condition_state: 'good',
      refund_amount: 3_000,
      credit_reduction: 0,
      method_code: 'cash',
      reason: 'Trop élevé',
      request_key: 'lot2-dep-overval',
    });
    assert.equal(badDepositOverValue.status, 400);

    // 5. Clôture de caisse avec écart : refusée sans note, acceptée avec note et écart exact
    const cashSt = await api('GET', '/api/cash');
    assert.equal(cashSt.data.summary.theoreticalCash, 25_000);
    const sid = cashSt.data.activeSession.id;

    const badCloseNoNote = await api('POST', '/api/cash/close', {
      session_id: sid,
      physical_cash: 24_500,
      closing_notes: '',
      request_key: 'lot2-close-nonote',
    });
    assert.equal(badCloseNoNote.status, 400);

    const goodCloseWithDiff = await api('POST', '/api/cash/close', {
      session_id: sid,
      physical_cash: 24_500,
      closing_notes: 'Manquant justifié test',
      request_key: 'lot2-close-ok',
    });
    assert.equal(goodCloseWithDiff.status, 200);
    assert.equal(goodCloseWithDiff.data.theoretical_cash, 25_000);
    assert.equal(goodCloseWithDiff.data.physical_cash, 24_500);
    assert.equal(goodCloseWithDiff.data.difference, -500);
  });
});
