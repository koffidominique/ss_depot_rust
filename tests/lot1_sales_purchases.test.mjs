import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot1-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(tmpDir, 'lot1_test.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(tmpDir, 'Sauvegardes');

const { createApiApp } = await import('../server/app.ts');
const { closeDb, getDb } = await import('../server/db.ts');

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

describe('LOT 1 — Intégrité des retours de vente et des réceptions d’achat', () => {
  let categoryId = 0;
  let supplierId = 0;
  let productAId = 0;
  let pkgABtlId = 0;
  let pkgACasierId = 0;
  let productBId = 0;
  let pkgBBtlId = 0;
  let clientCreditId = 0;

  before(async () => {
    const app = createApiApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const setup = await api('POST', '/api/auth/setup', { pin: '135791' }, '');
    assert.equal(setup.status, 200);
    authToken = setup.data.token;

    const openCash = await api('POST', '/api/cash/open', {
      opening_cash: 200_000,
      request_key: 'lot1-cash-open',
    });
    assert.equal(openCash.status, 201);

    const cats = await api('GET', '/api/categories');
    categoryId = cats.data[0].id;

    const sup = await api('POST', '/api/suppliers', {
      name: 'Fournisseur Lot 1',
      phone: '+225 07 10 20 30 40',
      payment_terms_days: 30,
    });
    assert.equal(sup.status, 201);
    supplierId = sup.data.id;

    const prodA = await api('POST', '/api/products', {
      name: 'Bière Lot 1 65cl',
      category_id: categoryId,
      supplier_id: supplierId,
      base_unit: 'bouteille',
      initial_stock: '100',
      min_stock: '10',
      purchase_price: 400,
      retail_price: 600,
      packagings: [
        {
          name: 'bouteille',
          coefficient: '1',
          purchase_price: 400,
          wholesale_price: 500,
          semi_wholesale_price: 550,
          retail_price: 600,
          allow_fraction: true,
        },
        {
          name: 'casier',
          coefficient: '24',
          purchase_price: 9600,
          wholesale_price: 12000,
          semi_wholesale_price: 13200,
          retail_price: 14400,
          allow_fraction: false,
        },
      ],
    });
    assert.equal(prodA.status, 201);
    productAId = prodA.data.id;
    const prodAList = await api('GET', `/api/products?search=${encodeURIComponent('Bière Lot 1 65cl')}`);
    const prodAItem = prodAList.data.items.find((p) => p.id === productAId);
    pkgABtlId = prodAItem.packagings.find((pk) => pk.name === 'bouteille').id;
    pkgACasierId = prodAItem.packagings.find((pk) => pk.name === 'casier').id;

    const prodB = await api('POST', '/api/products', {
      name: 'Jus Lot 1 1L',
      category_id: categoryId,
      supplier_id: supplierId,
      base_unit: 'bouteille',
      initial_stock: '100',
      min_stock: '10',
      purchase_price: 800,
      retail_price: 1000,
      packagings: [
        {
          name: 'bouteille',
          coefficient: '1',
          purchase_price: 800,
          wholesale_price: 900,
          semi_wholesale_price: 950,
          retail_price: 1000,
          allow_fraction: false,
        },
      ],
    });
    assert.equal(prodB.status, 201);
    productBId = prodB.data.id;
    const prodBList = await api('GET', `/api/products?search=${encodeURIComponent('Jus Lot 1 1L')}`);
    pkgBBtlId = prodBList.data.items.find((p) => p.id === productBId).packagings[0].id;

    const cli = await api('POST', '/api/clients', {
      name: 'Client Crédit Lot 1',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 500_000,
      payment_terms_days: 15,
    });
    assert.equal(cli.status, 201);
    clientCreditId = cli.data.id;
  });

  after(async () => {
    closeDb();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1.1 Retours de vente : partiel, solde, dépassement, doublons, multi-lignes, vente annulée, idempotence et atomicité', async () => {
    const db = getDb();

    // Vente de 5 bouteilles A (5 * 600 = 3 000) + 4 bouteilles B (4 * 1 000 = 4 000) = 7 000 FCFA
    const saleRes = await api('POST', '/api/sales', {
      request_key: 'lot1-sale-main',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [
        { product_id: productAId, packaging_id: pkgABtlId, quantity: '5' },
        { product_id: productBId, packaging_id: pkgBBtlId, quantity: '4' },
      ],
      payments: [{ method_code: 'cash', amount: 7000 }],
    });
    assert.equal(saleRes.status, 201);
    const saleId = saleRes.data.id;
    const lineA = saleRes.data.lines.find((l) => l.product_id === productAId);
    const lineB = saleRes.data.lines.find((l) => l.product_id === productBId);

    // Stock après vente : A = 95, B = 96
    const stockAfterSale = await api('GET', '/api/stock');
    assert.equal(stockAfterSale.data.products.find((p) => p.id === productAId).stock_milli, 95_000);
    assert.equal(stockAfterSale.data.products.find((p) => p.id === productBId).stock_milli, 96_000);

    // 1. Rejet explicite de deux occurrences du même sale_line_id dans la même requête
    const dupLineRes = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-dup-line',
      reason: 'Tentative doublon ligne',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [
        { sale_line_id: lineA.id, base_quantity: '2' },
        { sale_line_id: lineA.id, base_quantity: '2' },
      ],
    });
    assert.equal(dupLineRes.status, 400);
    assert.match(dupLineRes.data.message, /dupliquée/i);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM sales_returns WHERE sale_id = ?').get(saleId)).c,
      0
    );

    // 2. Retour normal d'une partie d'une ligne (2 sur 5)
    const retPart = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-part-1',
      reason: 'Retour partiel 2 bouteilles A',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: lineA.id, base_quantity: '2' }],
    });
    assert.equal(retPart.status, 201);
    assert.equal(retPart.data.status, 'partially_returned');
    assert.equal(retPart.data.returns[0].total_amount, 1200);
    assert.equal(retPart.data.returns[0].refund_amount, 1200);
    assert.equal(retPart.data.returns[0].credit_reduction, 0);

    // 3. Rejeu idempotent avec la même request_key -> pas de deuxième retour ni mouvement stock
    const retReplay = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-part-1',
      reason: 'Retour partiel 2 bouteilles A',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: lineA.id, base_quantity: '2' }],
    });
    assert.equal(retReplay.status, 201);
    assert.equal(retReplay.data.returns.length, 1);

    // 4. Tentative de retour supérieur au solde restant (reste 3 sur A, demande 4)
    const overRet = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-over',
      reason: 'Dépassement solde A',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: lineA.id, base_quantity: '4' }],
    });
    assert.equal(overRet.status, 400);

    // 5. Erreur en cours de traitement sur multi-ligne (A valide 1 + B dépassement 5) -> aucune écriture partielle sur A !
    const stockBeforeFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productAId).stock_milli;
    const partialFail = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-atomic-fail',
      reason: 'Ligne B invalide doit rollback ligne A',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [
        { sale_line_id: lineA.id, base_quantity: '1' },
        { sale_line_id: lineB.id, base_quantity: '5' },
      ],
    });
    assert.equal(partialFail.status, 400);
    const stockAfterFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productAId).stock_milli;
    assert.equal(stockAfterFail, stockBeforeFail);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM sales_returns WHERE sale_id = ?').get(saleId)).c,
      1
    );

    // 6. Retour multi-lignes valide + solde restant complet (A: 3 restant, B: 4 restant) -> status 'returned'
    const retMultiRest = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-rest-all',
      reason: 'Solde complet multi-lignes',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [
        { sale_line_id: lineA.id, base_quantity: '3' },
        { sale_line_id: lineB.id, base_quantity: '4' },
      ],
    });
    assert.equal(retMultiRest.status, 201);
    assert.equal(retMultiRest.data.status, 'returned');
    assert.equal(retMultiRest.data.returns.length, 2);
    assert.equal(retMultiRest.data.returns[0].total_amount, 3 * 600 + 4 * 1000);

    // Stock revenu à 100 sur A et 100 sur B
    const stockFinal = await api('GET', '/api/stock');
    assert.equal(stockFinal.data.products.find((p) => p.id === productAId).stock_milli, 100_000);
    assert.equal(stockFinal.data.products.find((p) => p.id === productBId).stock_milli, 100_000);

    // 7. Retour d'une ligne déjà complètement retournée -> rejet
    const retAlreadyFull = await api('POST', `/api/sales/${saleId}/returns`, {
      request_key: 'lot1-ret-already-full',
      reason: 'Plus rien à retourner',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: lineA.id, base_quantity: '1' }],
    });
    assert.equal(retAlreadyFull.status, 400);
    assert.match(retAlreadyFull.data.message, /intégralement retournée/i);

    // 8. Retour sur une vente annulée -> rejet
    const saleToCancel = await api('POST', '/api/sales', {
      request_key: 'lot1-sale-cancel',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: productBId, packaging_id: pkgBBtlId, quantity: '2' }],
      payments: [{ method_code: 'cash', amount: 2000 }],
    });
    assert.equal(saleToCancel.status, 201);
    const cancelRes = await api('POST', `/api/sales/${saleToCancel.data.id}/cancel`, {
      reason: 'Annulation avant test retour',
      request_key: 'lot1-cancel-before-ret',
      refund_method_code: 'cash',
    });
    assert.equal(cancelRes.status, 200);

    const retOnCancelled = await api('POST', `/api/sales/${saleToCancel.data.id}/returns`, {
      request_key: 'lot1-ret-on-cancelled',
      reason: 'Doit échouer',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: saleToCancel.data.lines[0].id, base_quantity: '1' }],
    });
    assert.equal(retOnCancelled.status, 400);

    // 9. Vente à crédit avec paiement partiel : échec si remboursement espèces insuffisantes (ne doit PAS réduire créance !)
    const creditSale = await api('POST', '/api/sales', {
      request_key: 'lot1-sale-credit-rollback',
      client_id: clientCreditId,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: productBId, packaging_id: pkgBBtlId, quantity: '10' }],
      payments: [{ method_code: 'cash', amount: 2000 }],
    });
    assert.equal(creditSale.status, 201);
    // Rembourser avec une méthode inexistante quand refund_amount > 0 (retour de 9 bouteilles = 9000 -> 8000 créance + 1000 refund)
    const badRefundMethod = await api('POST', `/api/sales/${creditSale.data.id}/returns`, {
      request_key: 'lot1-ret-bad-method',
      reason: 'Moyen de remboursement invalide',
      restock_approved: true,
      refund_method_code: 'unknown_method',
      lines: [{ sale_line_id: creditSale.data.lines[0].id, base_quantity: '9' }],
    });
    assert.equal(badRefundMethod.status, 400);
    const saleCheckAfterRollback = await api('GET', `/api/sales/${creditSale.data.id}`);
    assert.equal(saleCheckAfterRollback.data.remaining_amount, 8000);
    assert.equal(saleCheckAfterRollback.data.returns.length, 0);

    // Réutilisation de request_key d'une autre vente -> 409 Conflict
    const crossSaleReplay = await api('POST', `/api/sales/${creditSale.data.id}/returns`, {
      request_key: 'lot1-ret-part-1',
      reason: 'Rejeu cross-vente interdit',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: creditSale.data.lines[0].id, base_quantity: '1' }],
    });
    assert.equal(crossSaleReplay.status, 409);
  });

  it('1.2 Réceptions d’achat : totale, partielle, cumul, dépassement, doublon ligne, concurrence, idempotence, CUMP et rollback', async () => {
    const db = getDb();

    // Commande 1 : 10 casiers A (9 600 FCFA/casier = 96 000) + 5 bouteilles B (800 FCFA = 4 000)
    const po1 = await api('POST', '/api/purchases', {
      request_key: 'lot1-po-1',
      supplier_id: supplierId,
      lines: [
        { product_id: productAId, packaging_id: pkgACasierId, quantity: '10', unit_price: 9600 },
        { product_id: productBId, packaging_id: pkgBBtlId, quantity: '5', unit_price: 800 },
      ],
    });
    assert.equal(po1.status, 201);
    const po1LineA = po1.data.lines.find((l) => l.product_id === productAId);
    const po1LineB = po1.data.lines.find((l) => l.product_id === productBId);

    // 1. Rejet explicite de ligne répétée dans une même demande de réception
    const dupPoLine = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-dup-line',
      lines: [
        { purchase_order_line_id: po1LineA.id, received_quantity: '6' },
        { purchase_order_line_id: po1LineA.id, received_quantity: '6' },
      ],
    });
    assert.equal(dupPoLine.status, 400);
    assert.match(dupPoLine.data.message, /dupliquée/i);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM purchase_receipts WHERE purchase_order_id = ?').get(po1.data.id)).c,
      0
    );

    // 2. Réception partielle (3 casiers A -> +72 bouteilles)
    const recPart1 = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-part-1',
      lines: [{ purchase_order_line_id: po1LineA.id, received_quantity: '3' }],
    });
    assert.equal(recPart1.status, 201);
    assert.equal(recPart1.data.total_amount, 28_800);

    // 3. Rejeu idempotent avec même request_key -> aucune nouvelle dette/réception/stock
    const recReplay = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-part-1',
      lines: [{ purchase_order_line_id: po1LineA.id, received_quantity: '3' }],
    });
    assert.equal(recReplay.status, 201);
    assert.equal(recReplay.data.id, recPart1.data.id);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM purchase_receipts WHERE purchase_order_id = ?').get(po1.data.id)).c,
      1
    );

    // 4. Échec transactionnel multi-ligne (ligne B valide 2 + ligne A dépassement 8 sur reliquat 7) -> rollback complet !
    const stockABeforeFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productAId).stock_milli;
    const stockBBeforeFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productBId).stock_milli;
    const failMulti = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-atomic-fail',
      lines: [
        { purchase_order_line_id: po1LineB.id, received_quantity: '2' },
        { purchase_order_line_id: po1LineA.id, received_quantity: '8' },
      ],
    });
    assert.equal(failMulti.status, 400);
    const stockAAfterFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productAId).stock_milli;
    const stockBAfterFail = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productBId).stock_milli;
    assert.equal(stockAAfterFail, stockABeforeFail);
    assert.equal(stockBAfterFail, stockBBeforeFail);

    // 5. Seconde réception partielle (3 casiers A -> reliquat passe à 4)
    const recPart2 = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-part-2',
      lines: [{ purchase_order_line_id: po1LineA.id, received_quantity: '3' }],
    });
    assert.equal(recPart2.status, 201);

    // 6. Deux requêtes de réception concurrentes demandant chacune 3 sur un reliquat de 4 -> une seule passe !
    const [conc1, conc2] = await Promise.all([
      api('POST', `/api/purchases/${po1.data.id}/receive`, {
        request_key: 'lot1-rec-conc-1',
        lines: [{ purchase_order_line_id: po1LineA.id, received_quantity: '3' }],
      }),
      api('POST', `/api/purchases/${po1.data.id}/receive`, {
        request_key: 'lot1-rec-conc-2',
        lines: [{ purchase_order_line_id: po1LineA.id, received_quantity: '3' }],
      }),
    ]);
    const statuses = [conc1.status, conc2.status].sort();
    assert.deepEqual(statuses, [201, 400]);

    // 7. Solde restant (1 casier A + 5 bouteilles B) -> statut 'received'
    const recFinal = await api('POST', `/api/purchases/${po1.data.id}/receive`, {
      request_key: 'lot1-rec-final',
      lines: [
        { purchase_order_line_id: po1LineA.id, received_quantity: '1' },
        { purchase_order_line_id: po1LineB.id, received_quantity: '5' },
      ],
    });
    assert.equal(recFinal.status, 201);

    const poList = await api('GET', '/api/purchases');
    const po1After = poList.data.find((o) => o.id === po1.data.id);
    assert.equal(po1After.status, 'received');
    assert.equal(po1After.received_amount, 100_000);

    // Stock A : 100 initial + 10*24 = 340 bouteilles (340 000 milli)
    // Stock B : 100 initial - 1 (vente non annulée test crédit 9/10... non, vente crédit avait 10 non retournées donc 90) + 5 reçues = 95 000 milli
    const stockEnd = await api('GET', '/api/stock');
    assert.equal(stockEnd.data.products.find((p) => p.id === productAId).stock_milli, 340_000);
    assert.equal(stockEnd.data.products.find((p) => p.id === productBId).stock_milli, 95_000);

    // 8. Commande 2 (réception totale + vérification CUMP exact sur prix différent)
    const prodC = await api('POST', '/api/products', {
      name: 'Produit CUMP Lot 1',
      category_id: categoryId,
      supplier_id: supplierId,
      base_unit: 'bouteille',
      initial_stock: '10',
      min_stock: '2',
      purchase_price: 500,
      retail_price: 700,
    });
    assert.equal(prodC.status, 201);
    const prodCList = await api('GET', `/api/products?search=${encodeURIComponent('Produit CUMP Lot 1')}`);
    const prodCItem = prodCList.data.items.find((p) => p.id === prodC.data.id);
    const pkgCId = prodCItem.packagings[0].id;

    // 10 bouteilles à 500 + 10 bouteilles à 700 = moyenne exacte 600 FCFA
    const po2 = await api('POST', '/api/purchases', {
      request_key: 'lot1-po-2-cump',
      supplier_id: supplierId,
      lines: [{ product_id: prodCItem.id, packaging_id: pkgCId, quantity: '10', unit_price: 700 }],
    });
    assert.equal(po2.status, 201);
    const rec2 = await api('POST', `/api/purchases/${po2.data.id}/receive`, {
      request_key: 'lot1-rec-2-cump',
      lines: [{ purchase_order_line_id: po2.data.lines[0].id, received_quantity: '10' }],
    });
    assert.equal(rec2.status, 201);
    assert.equal(rec2.data.total_amount, 7000);

    const prodCAfter = (await api('GET', '/api/stock')).data.products.find((p) => p.id === prodCItem.id);
    assert.equal(prodCAfter.stock_milli, 20_000);
    assert.equal(prodCAfter.average_cost_fcfa, 600);

    const debts = await api('GET', '/api/supplier-debts');
    const debt2 = debts.data.find((d) => d.receipt_id === rec2.data.id);
    assert.ok(debt2);
    assert.equal(debt2.initial_amount, 7000);
    assert.equal(debt2.remaining_amount, 7000);

    // Rejeu request_key sur autre PO -> 409 Conflict
    const crossPoReplay = await api('POST', `/api/purchases/${po2.data.id}/receive`, {
      request_key: 'lot1-rec-part-1',
      lines: [{ purchase_order_line_id: po2.data.lines[0].id, received_quantity: '1' }],
    });
    assert.equal(crossPoReplay.status, 409);
  });
});
