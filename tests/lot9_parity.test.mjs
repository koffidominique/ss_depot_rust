import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot9-parity-'));
const nodeDbPath = process.env.DEPOTPRO_PARITY_NODE_DB || path.join(tmpDir, 'node_depot.db');
const nodeBackupDir =
  process.env.DEPOTPRO_PARITY_NODE_BACKUP_DIR || path.join(path.dirname(nodeDbPath), 'Sauvegardes');

process.env.DEPOTPRO_DB_PATH = nodeDbPath;
process.env.DEPOTPRO_BACKUP_DIR = nodeBackupDir;

const RUST_URL = process.env.DEPOTPRO_PARITY_RUST_URL || '';
const RUST_DB_PATH = process.env.DEPOTPRO_PARITY_RUST_DB || '';
const DUAL_ENGINE = Boolean(RUST_URL);

const { createApiApp } = await import('../server/app.ts');
const { closeDb } = await import('../server/db.ts');

let server;
let nodeUrl = process.env.DEPOTPRO_PARITY_NODE_URL || '';

async function httpCall(baseUrl, method, endpoint, body, token = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

function assertErrorCode(res, expectedStatus, allowedCodes, label) {
  assert.equal(
    res.status,
    expectedStatus,
    `${label}: expected HTTP ${expectedStatus}, got ${res.status} (${JSON.stringify(res.data)})`
  );
  assert.ok(res.data && typeof res.data === 'object', `${label}: JSON error body required`);
  assert.ok(
    allowedCodes.includes(res.data.code),
    `${label}: expected code in ${JSON.stringify(allowedCodes)}, got ${res.data.code} (${res.data.message})`
  );
  assert.equal(typeof res.data.message, 'string', `${label}: message must be a string`);
  assert.ok(res.data.message.trim().length > 0, `${label}: message must be non-empty`);
}

function utcTodayPlusDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('LOT 9 — Parité métier Node.js / Rust (22 scénarios canoniques)', () => {
  const tokens = { node: '', rust: '' };

  // Identifiants partagés créés séquentiellement sur les deux moteurs
  const ids = {
    node: {
      clientA: 0,
      clientB: 0,
      supplier: 0,
      category: 0,
      returnableType: 0,
      product: 0,
      pkgBouteille: 0,
      pkgPack: 0,
      pkgCasier: 0,
      cashSession: 0,
      cashSale: 0,
      creditSale: 0,
      mixedSale: 0,
      cancelTargetSale: 0,
      receivable: 0,
      po: 0,
      poLine: 0,
      debt1: 0,
      debt2: 0,
      depositIssue: 0,
      inventory: 0,
      backupName: '',
    },
    rust: {
      clientA: 0,
      clientB: 0,
      supplier: 0,
      category: 0,
      returnableType: 0,
      product: 0,
      pkgBouteille: 0,
      pkgPack: 0,
      pkgCasier: 0,
      cashSession: 0,
      cashSale: 0,
      creditSale: 0,
      mixedSale: 0,
      cancelTargetSale: 0,
      receivable: 0,
      po: 0,
      poLine: 0,
      debt1: 0,
      debt2: 0,
      depositIssue: 0,
      inventory: 0,
      backupName: '',
    },
  };

  let preBackupReportsNode = null;
  let preBackupReportsRust = null;
  let preBackupVerifyNode = null;
  let preBackupVerifyRust = null;
  let expectedCash = 0;

  before(async () => {
    if (!nodeUrl) {
      const app = createApiApp();
      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          nodeUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    }
  });

  after(async () => {
    closeDb();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function callBoth(method, endpointOrFn, bodyOrFn, expectedStatus = 200) {
    const nodeEndpoint = typeof endpointOrFn === 'function' ? endpointOrFn('node', ids.node) : endpointOrFn;
    const nodeBody = typeof bodyOrFn === 'function' ? bodyOrFn('node', ids.node) : bodyOrFn;
    const nodeRes = await httpCall(nodeUrl, method, nodeEndpoint, nodeBody, tokens.node);
    if (expectedStatus !== null) {
      assert.equal(
        nodeRes.status,
        expectedStatus,
        `[node] ${method} ${nodeEndpoint} -> expected ${expectedStatus}, got ${nodeRes.status}: ${JSON.stringify(nodeRes.data)}`
      );
    }

    let rustRes = null;
    if (DUAL_ENGINE) {
      const rustEndpoint = typeof endpointOrFn === 'function' ? endpointOrFn('rust', ids.rust) : endpointOrFn;
      const rustBody = typeof bodyOrFn === 'function' ? bodyOrFn('rust', ids.rust) : bodyOrFn;
      rustRes = await httpCall(RUST_URL, method, rustEndpoint, rustBody, tokens.rust);
      if (expectedStatus !== null) {
        assert.equal(
          rustRes.status,
          expectedStatus,
          `[rust] ${method} ${rustEndpoint} -> expected ${expectedStatus}, got ${rustRes.status}: ${JSON.stringify(rustRes.data)}`
        );
      }
    }
    return { node: nodeRes, rust: rustRes };
  }

  async function expectRejectedBoth(method, endpointOrFn, bodyOrFn, status, nodeCodes, rustCodes, label) {
    const nodeStatus = typeof status === 'number' ? status : status.node;
    const rustStatus = typeof status === 'number' ? status : status.rust;
    const nodeEndpoint = typeof endpointOrFn === 'function' ? endpointOrFn('node', ids.node) : endpointOrFn;
    const nodeBody = typeof bodyOrFn === 'function' ? bodyOrFn('node', ids.node) : bodyOrFn;
    const nodeRes = await httpCall(nodeUrl, method, nodeEndpoint, nodeBody, tokens.node);
    assertErrorCode(nodeRes, nodeStatus, nodeCodes, `[node] ${label}`);

    if (DUAL_ENGINE) {
      const rustEndpoint = typeof endpointOrFn === 'function' ? endpointOrFn('rust', ids.rust) : endpointOrFn;
      const rustBody = typeof bodyOrFn === 'function' ? bodyOrFn('rust', ids.rust) : bodyOrFn;
      const rustRes = await httpCall(RUST_URL, method, rustEndpoint, rustBody, tokens.rust);
      assertErrorCode(rustRes, rustStatus, rustCodes, `[rust] ${label}`);
    }
  }

  it('0. Initialisation authentification propriétaire (setup PIN 6 chiffres)', async () => {
    const statusRes = await callBoth('GET', '/api/auth/status', undefined, 200);
    assert.equal(statusRes.node.data.needsSetup, true);
    if (statusRes.rust) {
      assert.equal(statusRes.rust.data.needsSetup, true);
    }

    const setupRes = await callBoth('POST', '/api/auth/setup', { pin: '246810' }, 200);
    tokens.node = setupRes.node.data.token;
    assert.ok(tokens.node);
    if (setupRes.rust) {
      tokens.rust = setupRes.rust.data.token;
      assert.ok(tokens.rust);
    }
  });

  it('Scénario 1 — Création client & politique de crédit (validation + DTO paritaire)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/clients',
      { name: '   ', client_type: 'particulier', credit_policy: 'forbidden' },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'client nom vide'
    );
    await expectRejectedBoth(
      'POST',
      '/api/clients',
      { name: 'Délai négatif', client_type: 'particulier', credit_policy: 'forbidden', payment_terms_days: -5 },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'client délai négatif'
    );

    const resA = await callBoth(
      'POST',
      '/api/clients',
      {
        name: 'Maquis Le Palmier',
        client_type: 'particulier',
        phone: '0707070701',
        credit_policy: 'forbidden',
      },
      201
    );
    const resB = await callBoth(
      'POST',
      '/api/clients',
      {
        name: 'Hôtel Ivoire Distribution',
        client_type: 'professionnel',
        phone: '0707070702',
        address: 'Cocody Riviera',
        city: 'Abidjan',
        credit_policy: 'limited',
        credit_limit: 500000,
        payment_terms_days: 15,
      },
      201
    );

    ids.node.clientA = resA.node.data.id;
    ids.node.clientB = resB.node.data.id;
    assert.equal(resA.node.data.credit_policy, 'forbidden');
    assert.equal(resB.node.data.credit_policy, 'limited');
    assert.equal(resB.node.data.credit_limit, 500000);
    assert.equal(resB.node.data.payment_terms_days, 15);
    assert.equal(resB.node.data.unpaid_balance, 0);

    if (DUAL_ENGINE) {
      ids.rust.clientA = resA.rust.data.id;
      ids.rust.clientB = resB.rust.data.id;
      assert.equal(resA.rust.data.code, resA.node.data.code);
      assert.equal(resB.rust.data.credit_policy, resB.node.data.credit_policy);
      assert.equal(resB.rust.data.credit_limit, resB.node.data.credit_limit);
      assert.equal(resB.rust.data.payment_terms_days, resB.node.data.payment_terms_days);
      assert.equal(resB.rust.data.unpaid_balance, resB.node.data.unpaid_balance);
    }

    await expectRejectedBoth(
      'PUT',
      (_e, ctx) => `/api/clients/${ctx.clientA}/credit`,
      { credit_policy: 'invalid_policy' },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'politique crédit invalide'
    );

    const creditUpd = await callBoth(
      'PUT',
      (_e, ctx) => `/api/clients/${ctx.clientA}/credit`,
      { credit_policy: 'forbidden', payment_terms_days: 0 },
      200
    );
    assert.equal(creditUpd.node.data.policy, 'forbidden');
    assert.equal(creditUpd.node.data.credit_limit, null);
    if (creditUpd.rust) {
      assert.equal(creditUpd.rust.data.policy, 'forbidden');
      assert.equal(creditUpd.rust.data.credit_limit, null);
      assert.equal(creditUpd.rust.data.client_id, ids.rust.clientA);
    }
  });

  it('Scénario 2 — Création fournisseur', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/suppliers',
      { name: 'Sans Téléphone', phone: '  ' },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'fournisseur sans téléphone'
    );

    const supRes = await callBoth(
      'POST',
      '/api/suppliers',
      {
        name: 'Brasseries SOLIBRA',
        company_name: 'SOLIBRA SA',
        phone: '0102030405',
        address: 'Zone Industrielle',
        payment_terms_days: 30,
      },
      201
    );
    ids.node.supplier = supRes.node.data.id;
    assert.equal(supRes.node.data.payment_terms_days, 30);
    assert.equal(supRes.node.data.total_purchases, 0);
    assert.equal(supRes.node.data.balance_due, 0);
    if (supRes.rust) {
      ids.rust.supplier = supRes.rust.data.id;
      assert.equal(supRes.rust.data.code, supRes.node.data.code);
      assert.equal(supRes.rust.data.payment_terms_days, 30);
      assert.equal(supRes.rust.data.balance_due, 0);
    }
  });

  it('Scénario 3 — Création produit (stock initial, tarifs, CUMP initial)', async () => {
    const catRes = await callBoth(
      'POST',
      '/api/categories',
      { name: 'Bières Lot 9', description: 'Gamme parité' },
      201
    );
    ids.node.category = catRes.node.data.id;
    if (catRes.rust) ids.rust.category = catRes.rust.data.id;

    const rtRes = await callBoth(
      'POST',
      '/api/consignments/types',
      {
        code: 'EMB-LOT9-CAS24',
        name: 'Casier 24 Lot 9',
        producer: 'SOLIBRA',
        kind: 'crate',
        deposit_value: 2500,
        initial_stock: 20,
      },
      201
    );
    ids.node.returnableType = rtRes.node.data.id;
    assert.equal(rtRes.node.data.stock_quantity, 20);
    if (rtRes.rust) {
      ids.rust.returnableType = rtRes.rust.data.id;
      assert.equal(rtRes.rust.data.stock_quantity, 20);
      assert.equal(rtRes.rust.data.deposit_value, 2500);
    }

    await expectRejectedBoth(
      'POST',
      '/api/products',
      (_e, ctx) => ({
        name: '   ',
        category_id: ctx.category,
        base_unit: 'bouteille',
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'produit nom vide'
    );
    await expectRejectedBoth(
      'POST',
      '/api/products',
      (_e, ctx) => ({
        name: 'Prix négatif',
        category_id: ctx.category,
        base_unit: 'bouteille',
        purchase_price: -10,
      }),
      400,
      ['INVALID_MONEY', 'VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'produit prix négatif'
    );

    const prodRes = await callBoth(
      'POST',
      '/api/products',
      (_e, ctx) => ({
        name: 'Flag Spéciale 65cl',
        brand: 'SOLIBRA',
        category_id: ctx.category,
        supplier_id: ctx.supplier,
        base_unit: 'bouteille',
        initial_stock: '10',
        min_stock: 24,
        max_stock: '500',
        purchase_price: 450,
        wholesale_price: 550,
        semi_wholesale_price: 600,
        retail_price: 650,
        packagings: [
          {
            name: 'bouteille',
            coefficient: '1',
            purchase_price: 450,
            wholesale_price: 550,
            semi_wholesale_price: 600,
            retail_price: 650,
            allow_fraction: false,
            deposit_mode: 'none',
          },
        ],
      }),
      201
    );

    ids.node.product = prodRes.node.data.id;
    ids.node.pkgBouteille = prodRes.node.data.packagings[0].id;
    assert.equal(prodRes.node.data.stock_milli, 10000);
    assert.equal(prodRes.node.data.min_stock_milli, 24000);
    assert.equal(prodRes.node.data.max_stock_milli, 500000);
    assert.equal(prodRes.node.data.average_cost_fcfa, 450);

    if (prodRes.rust) {
      ids.rust.product = prodRes.rust.data.id;
      ids.rust.pkgBouteille = prodRes.rust.data.packagings[0].id;
      assert.equal(prodRes.rust.data.reference, prodRes.node.data.reference);
      assert.equal(prodRes.rust.data.stock_milli, prodRes.node.data.stock_milli);
      assert.equal(prodRes.rust.data.min_stock_milli, prodRes.node.data.min_stock_milli);
      assert.equal(prodRes.rust.data.max_stock_milli, prodRes.node.data.max_stock_milli);
      assert.equal(prodRes.rust.data.average_cost_fcfa, prodRes.node.data.average_cost_fcfa);
    }
  });

  it('Scénario 4 — Création conditionnements (pack=6, casier=24 consigné, doublon DUPLICATE_OPERATION)', async () => {
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/products/${ctx.product}/packagings`,
      { name: 'bouteille', coefficient: '1', retail_price: 650 },
      { node: 400, rust: 409 },
      ['DUPLICATE_OPERATION'],
      ['DUPLICATE_OPERATION'],
      'conditionnement dupliqué'
    );
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/products/${ctx.product}/packagings`,
      { name: 'pack', coefficient: 6, retail_price: -5 },
      400,
      ['INVALID_MONEY', 'VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'prix conditionnement négatif'
    );
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/products/${ctx.product}/packagings`,
      {
        name: 'casier',
        coefficient: 24,
        retail_price: 15600,
        deposit_mode: 'deposit',
        components: [{ returnable_id: 999999, pieces_per_pack: 1 }],
      },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'returnable_id inconnu'
    );

    const packRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/products/${ctx.product}/packagings`,
      {
        name: 'pack',
        coefficient: 6,
        purchase_price: 2700,
        wholesale_price: 3300,
        semi_wholesale_price: 3600,
        retail_price: 3900,
        allow_fraction: false,
        deposit_mode: 'none',
      },
      200
    );
    ids.node.pkgPack = packRes.node.data.id;
    assert.equal(packRes.node.data.coefficient_milli, 6000);
    if (packRes.rust) {
      ids.rust.pkgPack = packRes.rust.data.id;
      assert.equal(packRes.rust.data.coefficient_milli, 6000);
    }

    const casierRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/products/${ctx.product}/packagings`,
      (_e, ctx) => ({
        name: 'casier',
        coefficient: '24',
        purchase_price: 10800,
        wholesale_price: 13200,
        semi_wholesale_price: 14400,
        retail_price: 15600,
        allow_fraction: false,
        deposit_mode: 'deposit',
        components: [{ returnable_id: ctx.returnableType, pieces_per_pack: 1 }],
      }),
      200
    );
    ids.node.pkgCasier = casierRes.node.data.id;
    assert.equal(casierRes.node.data.coefficient_milli, 24000);
    assert.equal(casierRes.node.data.deposit_mode, 'deposit');
    assert.equal(casierRes.node.data.components.length, 1);
    if (casierRes.rust) {
      ids.rust.pkgCasier = casierRes.rust.data.id;
      assert.equal(casierRes.rust.data.coefficient_milli, 24000);
      assert.equal(casierRes.rust.data.deposit_mode, 'deposit');
      assert.equal(casierRes.rust.data.components.length, 1);
    }
  });

  it('Scénario 5 — Ajustement stock (+100 bouteilles, rejet stock insuffisant, idempotence)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/stock/adjust',
      (_e, ctx) => ({
        product_id: ctx.product,
        direction: 'out',
        quantity: '100',
        reason: 'Sortie impossible',
        request_key: 'lot9-adj-fail-1',
      }),
      400,
      ['INSUFFICIENT_STOCK'],
      ['INSUFFICIENT_STOCK'],
      'ajustement stock négatif refusé'
    );
    await expectRejectedBoth(
      'POST',
      '/api/stock/adjust',
      (_e, ctx) => ({
        product_id: ctx.product,
        direction: 'in',
        quantity: '5',
        reason: 'ab',
        request_key: 'lot9-adj-fail-2',
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'motif trop court'
    );

    const adjRes = await callBoth(
      'POST',
      '/api/stock/adjust',
      (_e, ctx) => ({
        product_id: ctx.product,
        direction: 'in',
        quantity: 100,
        reason: 'Inventaire initial complémentaire',
        request_key: 'lot9-adj-1',
      }),
      201
    );
    assert.equal(adjRes.node.data.quantity_milli, 100000);
    assert.equal(adjRes.node.data.stock_before_milli, 10000);
    assert.equal(adjRes.node.data.stock_after_milli, 110000);
    if (adjRes.rust) {
      assert.equal(adjRes.rust.data.quantity_milli, 100000);
      assert.equal(adjRes.rust.data.stock_before_milli, 10000);
      assert.equal(adjRes.rust.data.stock_after_milli, 110000);
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      '/api/stock/adjust',
      (_e, ctx) => ({
        product_id: ctx.product,
        direction: 'in',
        quantity: 100,
        reason: 'Inventaire initial complémentaire',
        request_key: 'lot9-adj-1',
      }),
      201
    );
    assert.equal(replay.node.data.id, adjRes.node.data.id);
    assert.equal(replay.node.data.stock_after_milli, 110000);
    if (replay.rust) {
      assert.equal(replay.rust.data.id, adjRes.rust.data.id);
      assert.equal(replay.rust.data.stock_after_milli, 110000);
    }
  });

  it('Scénario 6 — Ouverture caisse (session obligatoire pour vente, idempotence, doublon bloqué)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-no-session',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '1' }],
        payments: [{ method_code: 'cash', amount: 650 }],
      }),
      400,
      ['SESSION_NOT_OPEN'],
      ['SESSION_NOT_OPEN'],
      'vente sans session ouverte'
    );
    await expectRejectedBoth(
      'POST',
      '/api/cash/open',
      { opening_cash: 50000, request_key: '  ' },
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'ouverture caisse clé vide'
    );

    const openRes = await callBoth(
      'POST',
      '/api/cash/open',
      { opening_cash: 50000, request_key: 'lot9-cash-open-1' },
      201
    );
    ids.node.cashSession = openRes.node.data.id;
    expectedCash = 50000;
    assert.equal(openRes.node.data.status, 'open');
    assert.equal(openRes.node.data.opening_cash, 50000);
    if (openRes.rust) {
      ids.rust.cashSession = openRes.rust.data.id;
      assert.equal(openRes.rust.data.status, 'open');
      assert.equal(openRes.rust.data.opening_cash, 50000);
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      '/api/cash/open',
      { opening_cash: 50000, request_key: 'lot9-cash-open-1' },
      201
    );
    assert.equal(replay.node.data.id, ids.node.cashSession);
    if (replay.rust) assert.equal(replay.rust.data.id, ids.rust.cashSession);

    // Seconde session simultanée interdite
    await expectRejectedBoth(
      'POST',
      '/api/cash/open',
      { opening_cash: 10000, request_key: 'lot9-cash-open-dup' },
      400,
      ['SESSION_ALREADY_OPEN'],
      ['SESSION_ALREADY_OPEN'],
      'seconde session ouverte simultanée'
    );
  });

  it('Scénario 7 — Vente comptant (1 casier consigné + 3 bouteilles = 20 050 FCFA, -27 unités)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-frac-bad',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '1.5' }],
        payments: [{ method_code: 'cash', amount: 975 }],
      }),
      400,
      ['INVALID_QUANTITY', 'VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'fraction refusée sur bouteille'
    );
    await expectRejectedBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-underpay',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '2' }],
        payments: [{ method_code: 'cash', amount: 1000 }],
      }),
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'sous-paiement comptant refusé'
    );

    const saleRes = await callBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-cash-1',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [
          { product_id: ctx.product, packaging_id: ctx.pkgCasier, quantity: 1 },
          { product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '3' },
        ],
        payments: [{ method_code: 'cash', amount: 20050 }],
      }),
      201
    );

    ids.node.cashSale = saleRes.node.data.id;
    expectedCash += 20050;
    assert.equal(saleRes.node.data.total_merchandise, 17550);
    assert.equal(saleRes.node.data.total_deposit, 2500);
    assert.equal(saleRes.node.data.total_amount, 20050);
    assert.equal(saleRes.node.data.paid_amount, 20050);
    assert.equal(saleRes.node.data.status, 'validated');

    if (saleRes.rust) {
      ids.rust.cashSale = saleRes.rust.data.id;
      assert.equal(saleRes.rust.data.reference, saleRes.node.data.reference);
      assert.equal(saleRes.rust.data.total_merchandise, 17550);
      assert.equal(saleRes.rust.data.total_deposit, 2500);
      assert.equal(saleRes.rust.data.total_amount, 20050);
      assert.equal(saleRes.rust.data.paid_amount, 20050);
    }

    // Rejeu idempotent + vérification stock (110 - 27 = 83)
    const replay = await callBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-cash-1',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [
          { product_id: ctx.product, packaging_id: ctx.pkgCasier, quantity: 1 },
          { product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '3' },
        ],
        payments: [{ method_code: 'cash', amount: 20050 }],
      }),
      201
    );
    assert.equal(replay.node.data.id, ids.node.cashSale);
    if (replay.rust) assert.equal(replay.rust.data.id, ids.rust.cashSale);

    const stockRes = await callBoth('GET', '/api/stock', undefined, 200);
    assert.equal(stockRes.node.data.products[0].stock_milli, 83000);
    if (stockRes.rust) assert.equal(stockRes.rust.data.products[0].stock_milli, 83000);
  });

  it('Scénario 8 — Vente à crédit (contrôles politique & plafond, créance 30 000 FCFA, consigne client)', async () => {
    // Client interdit de crédit
    await expectRejectedBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-credit-forbidden',
        client_id: ctx.clientA,
        sale_type: 'credit',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '2' }],
        payments: [],
      }),
      400,
      ['CREDIT_FORBIDDEN'],
      ['CREDIT_POLICY_VIOLATION'],
      'crédit interdit'
    );

    // Test plafond dépassé (abaisse temporairement le plafond à 20 000 puis restaure à 500 000)
    await callBoth(
      'PUT',
      (_e, ctx) => `/api/clients/${ctx.clientB}/credit`,
      { credit_policy: 'limited', credit_limit: 20000, payment_terms_days: 15 },
      200
    );
    await expectRejectedBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-credit-limit',
        client_id: ctx.clientB,
        sale_type: 'credit',
        price_tier: 'wholesale',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgCasier, quantity: '2' }],
        payments: [{ method_code: 'cash', amount: 1400 }],
      }),
      400,
      ['CREDIT_LIMIT_EXCEEDED'],
      ['CREDIT_POLICY_VIOLATION'],
      'plafond crédit dépassé'
    );
    await callBoth(
      'PUT',
      (_e, ctx) => `/api/clients/${ctx.clientB}/credit`,
      { credit_policy: 'limited', credit_limit: 500000, payment_terms_days: 15 },
      200
    );

    // Vente à crédit valide : 2 casiers gros (26 400) + consigne (5 000) = 31 400, acompte 1 400 -> créance 30 000
    const saleRes = await callBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-credit-1',
        client_id: ctx.clientB,
        sale_type: 'credit',
        price_tier: 'wholesale',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgCasier, quantity: '2' }],
        payments: [{ method_code: 'cash', amount: 1400 }],
      }),
      201
    );
    ids.node.creditSale = saleRes.node.data.id;
    expectedCash += 1400;
    assert.equal(saleRes.node.data.total_merchandise, 26400);
    assert.equal(saleRes.node.data.total_deposit, 5000);
    assert.equal(saleRes.node.data.total_amount, 31400);
    assert.equal(saleRes.node.data.paid_amount, 1400);

    if (saleRes.rust) {
      ids.rust.creditSale = saleRes.rust.data.id;
      assert.equal(saleRes.rust.data.total_merchandise, 26400);
      assert.equal(saleRes.rust.data.total_deposit, 5000);
      assert.equal(saleRes.rust.data.total_amount, 31400);
      assert.equal(saleRes.rust.data.paid_amount, 1400);
    }

    const recList = await callBoth('GET', '/api/receivables', undefined, 200);
    const nodeRec = recList.node.data.find((r) => r.sale_id === ids.node.creditSale);
    assert.ok(nodeRec);
    ids.node.receivable = nodeRec.id;
    assert.equal(nodeRec.initial_amount, 30000);
    assert.equal(nodeRec.remaining_amount, 30000);
    assert.equal(nodeRec.status, 'partial');
    assert.equal(nodeRec.due_date, utcTodayPlusDays(15));

    if (recList.rust) {
      const rustRec = recList.rust.data.find((r) => r.sale_id === ids.rust.creditSale);
      assert.ok(rustRec);
      ids.rust.receivable = rustRec.id;
      assert.equal(rustRec.initial_amount, 30000);
      assert.equal(rustRec.remaining_amount, 30000);
      assert.equal(rustRec.status, 'partial');
      assert.equal(rustRec.due_date, nodeRec.due_date);
    }

    // Consigne client ouverte (2 pièces, 5 000 FCFA)
    const consOv = await callBoth('GET', '/api/consignments', undefined, 200);
    const nodeIssue = consOv.node.data.openIssues.find((i) => i.sale_id === ids.node.creditSale);
    assert.ok(nodeIssue);
    ids.node.depositIssue = nodeIssue.id;
    assert.equal(nodeIssue.pieces, 2);
    assert.equal(consOv.node.data.clientBalances[0].balance_pieces, 2);
    assert.equal(consOv.node.data.clientBalances[0].deposit_held_amount, 5000);
    if (consOv.rust) {
      const rustIssue = consOv.rust.data.openIssues.find((i) => i.sale_id === ids.rust.creditSale);
      assert.ok(rustIssue);
      ids.rust.depositIssue = rustIssue.id;
      assert.equal(rustIssue.pieces, 2);
      assert.equal(consOv.rust.data.clientBalances[0].balance_pieces, 2);
      assert.equal(consOv.rust.data.clientBalances[0].deposit_held_amount, 5000);
    }
  });

  it('Scénario 9 — Paiement mixte (13 000 FCFA = 3 000 espèces + 4 000 Wave + 6 000 OM)', async () => {
    const saleRes = await callBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-mixed-1',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '20' }],
        payments: [
          { method_code: 'cash', amount: 3000 },
          { method_code: 'wave', amount: 4000 },
          { method_code: 'orange_money', amount: 6000 },
        ],
      }),
      201
    );
    ids.node.mixedSale = saleRes.node.data.id;
    expectedCash += 3000;
    assert.equal(saleRes.node.data.total_amount, 13000);
    assert.equal(saleRes.node.data.payments.length, 3);
    if (saleRes.rust) {
      ids.rust.mixedSale = saleRes.rust.data.id;
      assert.equal(saleRes.rust.data.total_amount, 13000);
      assert.equal(saleRes.rust.data.payments.length, 3);
    }

    const cashRes = await callBoth('GET', '/api/cash', undefined, 200);
    assert.equal(cashRes.node.data.summary.theoreticalCash, expectedCash);
    if (cashRes.rust) {
      assert.equal(cashRes.rust.data.summary.theoreticalCash, expectedCash);
    }
  });

  it('Scénario 10 — Retour de vente partiel (4 bouteilles -> avoir AVO-*, remise en stock, remboursement caisse)', async () => {
    const nodeDetail = await httpCall(nodeUrl, 'GET', `/api/sales/${ids.node.mixedSale}`, undefined, tokens.node);
    const nodeLineId = nodeDetail.data.lines[0].id;
    let rustLineId = 0;
    if (DUAL_ENGINE) {
      const rustDetail = await httpCall(RUST_URL, 'GET', `/api/sales/${ids.rust.mixedSale}`, undefined, tokens.rust);
      rustLineId = rustDetail.data.lines[0].id;
    }

    // Ligne dupliquée bloquée
    await expectRejectedBoth(
      'POST',
      (eng, ctx) => `/api/sales/${ctx.mixedSale}/returns`,
      (eng) => ({
        request_key: 'lot9-ret-dup-line',
        reason: 'Doublon ligne',
        restock_approved: true,
        refund_method_code: 'cash',
        lines: [
          { sale_line_id: eng === 'node' ? nodeLineId : rustLineId, base_quantity: '1' },
          { sale_line_id: eng === 'node' ? nodeLineId : rustLineId, base_quantity: '1' },
        ],
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'doublon sale_line_id'
    );

    const retRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.mixedSale}/returns`,
      (eng) => ({
        request_key: 'lot9-ret-1',
        reason: 'Surplus client Lot 9',
        restock_approved: true,
        refund_method_code: 'cash',
        lines: [{ sale_line_id: eng === 'node' ? nodeLineId : rustLineId, base_quantity: '4' }],
      }),
      201
    );
    expectedCash -= 2600;
    assert.equal(retRes.node.data.status, 'partially_returned');
    assert.equal(retRes.node.data.returns[0].total_amount, 2600);
    assert.equal(retRes.node.data.returns[0].refund_amount, 2600);
    assert.ok(retRes.node.data.returns[0].credit_note_ref.startsWith('AVO'));

    if (retRes.rust) {
      assert.equal(retRes.rust.data.status, 'partially_returned');
      assert.equal(retRes.rust.data.returns[0].total_amount, 2600);
      assert.equal(retRes.rust.data.returns[0].refund_amount, 2600);
      assert.equal(retRes.rust.data.returns[0].credit_note_ref, retRes.node.data.returns[0].credit_note_ref);
    }

    // Dépassement quantité restante (reste 16, tentative 17)
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.mixedSale}/returns`,
      (eng) => ({
        request_key: 'lot9-ret-over',
        reason: 'Trop',
        restock_approved: true,
        refund_method_code: 'cash',
        lines: [{ sale_line_id: eng === 'node' ? nodeLineId : rustLineId, base_quantity: '17' }],
      }),
      400,
      ['INVALID_QUANTITY', 'VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'dépassement quantité retour'
    );

    // Collision cross-sale request_key (409)
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cashSale}/returns`,
      (eng) => ({
        request_key: 'lot9-ret-1',
        reason: 'Collision',
        restock_approved: true,
        refund_method_code: 'cash',
        lines: [{ sale_line_id: eng === 'node' ? nodeLineId : rustLineId, base_quantity: '1' }],
      }),
      409,
      ['DUPLICATE_OPERATION'],
      ['DUPLICATE_OPERATION'],
      'retour clé réutilisée sur autre vente'
    );
  });

  it('Scénario 11 — Annulation de vente (immuabilité après retour, remboursement Wave, collision 409)', async () => {
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.mixedSale}/cancel`,
      { reason: 'Annulation après retour', refund_method_code: 'cash', request_key: 'lot9-cancel-fail' },
      400,
      ['HISTORICAL_IMMUTABLE'],
      ['HISTORICAL_IMMUTABLE'],
      'annulation après retour partiel interdite'
    );

    const toCancelRes = await callBoth(
      'POST',
      '/api/sales',
      (_e, ctx) => ({
        request_key: 'lot9-sale-to-cancel',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: ctx.product, packaging_id: ctx.pkgBouteille, quantity: '2' }],
        payments: [{ method_code: 'wave', amount: 1300 }],
      }),
      201
    );
    ids.node.cancelTargetSale = toCancelRes.node.data.id;
    if (toCancelRes.rust) ids.rust.cancelTargetSale = toCancelRes.rust.data.id;

    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cancelTargetSale}/cancel`,
      { reason: 'Erreur', refund_method_code: 'methode_inconnue', request_key: 'lot9-cancel-bad-pm' },
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'moyen remboursement inconnu'
    );

    const cancelRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cancelTargetSale}/cancel`,
      { reason: 'Erreur caisse', refund_method_code: 'wave', request_key: 'lot9-cancel-1' },
      200
    );
    assert.equal(cancelRes.node.data.status, 'cancelled');
    assert.equal(cancelRes.node.data.cancellation.refunded_amount, 1300);
    assert.equal(cancelRes.node.data.cancellation.refund_method_code, 'wave');
    if (cancelRes.rust) {
      assert.equal(cancelRes.rust.data.status, 'cancelled');
      assert.equal(cancelRes.rust.data.cancellation.refunded_amount, 1300);
      assert.equal(cancelRes.rust.data.cancellation.refund_method_code, 'wave');
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cancelTargetSale}/cancel`,
      { reason: 'Erreur caisse', refund_method_code: 'wave', request_key: 'lot9-cancel-1' },
      200
    );
    assert.equal(replay.node.data.status, 'cancelled');
    if (replay.rust) assert.equal(replay.rust.data.status, 'cancelled');

    // Collision cross-sale 409
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cashSale}/cancel`,
      { reason: 'Collision', refund_method_code: 'cash', request_key: 'lot9-cancel-1' },
      409,
      ['DUPLICATE_OPERATION'],
      ['DUPLICATE_OPERATION'],
      'annulation clé réutilisée sur autre vente'
    );

    // Double annulation avec nouvelle clé -> HISTORICAL_IMMUTABLE
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/sales/${ctx.cancelTargetSale}/cancel`,
      { reason: 'Double annulation', refund_method_code: 'wave', request_key: 'lot9-cancel-2' },
      400,
      ['HISTORICAL_IMMUTABLE'],
      ['HISTORICAL_IMMUTABLE'],
      'double annulation interdite'
    );

    // Stock revenu à 19 bouteilles (83 - 48 - 20 + 4 - 2 + 2 = 19)
    const stockRes = await callBoth('GET', '/api/stock', undefined, 200);
    assert.equal(stockRes.node.data.products[0].stock_milli, 19000);
    if (stockRes.rust) assert.equal(stockRes.rust.data.products[0].stock_milli, 19000);
  });

  it('Scénario 12 — Paiement de créance (ventilation mixte 10 000 espèces + 5 000 Wave, reste 15 000)', async () => {
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/receivables/${ctx.receivable}/pay`,
      { request_key: 'lot9-pay-rec-over', parts: [{ method_code: 'cash', amount: 35000 }] },
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'surpaiement créance'
    );

    const payRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/receivables/${ctx.receivable}/pay`,
      {
        request_key: 'lot9-pay-rec-1',
        note: 'Règlement partiel Lot 9',
        parts: [
          { method_code: 'cash', amount: 10000 },
          { method_code: 'wave', amount: 5000 },
        ],
      },
      200
    );
    expectedCash += 10000;
    assert.equal(payRes.node.data.remaining_amount, 15000);
    assert.equal(payRes.node.data.status, 'partial');
    if (payRes.rust) {
      assert.equal(payRes.rust.data.remaining_amount, 15000);
      assert.equal(payRes.rust.data.status, 'partial');
    }

    const replay = await callBoth(
      'POST',
      (_e, ctx) => `/api/receivables/${ctx.receivable}/pay`,
      {
        request_key: 'lot9-pay-rec-1',
        parts: [
          { method_code: 'cash', amount: 10000 },
          { method_code: 'wave', amount: 5000 },
        ],
      },
      200
    );
    assert.equal(replay.node.data.remaining_amount, 15000);
    if (replay.rust) assert.equal(replay.rust.data.remaining_amount, 15000);
  });

  it("Scénario 13 — Création commande d'achat (10 casiers @ 10 800 FCFA, sans effet sur stock)", async () => {
    const poRes = await callBoth(
      'POST',
      '/api/purchases',
      (_e, ctx) => ({
        request_key: 'lot9-po-1',
        supplier_id: ctx.supplier,
        expected_date: utcTodayPlusDays(2),
        notes: 'Réapprovisionnement Lot 9',
        lines: [
          {
            product_id: ctx.product,
            packaging_id: ctx.pkgCasier,
            quantity: '10',
            unit_price: 10800,
          },
        ],
      }),
      201
    );
    ids.node.po = poRes.node.data.id;
    ids.node.poLine = poRes.node.data.lines[0].id;
    assert.equal(poRes.node.data.status, 'confirmed');
    assert.equal(poRes.node.data.total_amount, 108000);
    assert.equal(poRes.node.data.received_amount, 0);
    assert.deepEqual(poRes.node.data.debts, []);

    if (poRes.rust) {
      ids.rust.po = poRes.rust.data.id;
      ids.rust.poLine = poRes.rust.data.lines[0].id;
      assert.equal(poRes.rust.data.reference, poRes.node.data.reference);
      assert.equal(poRes.rust.data.status, 'confirmed');
      assert.equal(poRes.rust.data.total_amount, 108000);
      assert.deepEqual(poRes.rust.data.debts, []);
    }

    // Stock inchangé à 19 000 milli
    const stockRes = await callBoth('GET', '/api/stock', undefined, 200);
    assert.equal(stockRes.node.data.products[0].stock_milli, 19000);
    if (stockRes.rust) assert.equal(stockRes.rust.data.products[0].stock_milli, 19000);
  });

  it('Scénario 14 — Réception partielle (4 casiers -> +96 bouteilles, dette 43 200 FCFA)', async () => {
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/receive`,
      (_e, ctx) => ({
        request_key: 'lot9-rec-dup-line',
        lines: [
          { purchase_order_line_id: ctx.poLine, received_quantity: '2' },
          { purchase_order_line_id: ctx.poLine, received_quantity: '2' },
        ],
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'doublon ligne réception'
    );

    const rec1 = await callBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/receive`,
      (_e, ctx) => ({
        request_key: 'lot9-rec-1',
        notes: 'Première livraison',
        lines: [
          {
            purchase_order_line_id: ctx.poLine,
            received_quantity: '4',
            discrepancy_reason: 'Livraison partielle convenue',
          },
        ],
      }),
      201
    );
    assert.equal(rec1.node.data.total_amount, 43200);
    if (rec1.rust) assert.equal(rec1.rust.data.total_amount, 43200);

    // Annulation impossible après réception partielle
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/cancel`,
      { reason: 'Annulation impossible' },
      400,
      ['HISTORICAL_IMMUTABLE'],
      ['HISTORICAL_IMMUTABLE'],
      'annulation PO partiel'
    );

    const pos = await callBoth('GET', '/api/purchases', undefined, 200);
    const nodePo = pos.node.data.find((o) => o.id === ids.node.po);
    assert.equal(nodePo.status, 'partial');
    assert.equal(nodePo.received_amount, 43200);
    assert.equal(nodePo.debts.length, 1);
    ids.node.debt1 = nodePo.debts[0].id;
    assert.equal(nodePo.debts[0].initial_amount, 43200);
    assert.equal(nodePo.debts[0].due_date, utcTodayPlusDays(30));

    if (pos.rust) {
      const rustPo = pos.rust.data.find((o) => o.id === ids.rust.po);
      assert.equal(rustPo.status, 'partial');
      assert.equal(rustPo.received_amount, 43200);
      assert.equal(rustPo.debts.length, 1);
      ids.rust.debt1 = rustPo.debts[0].id;
      assert.equal(rustPo.debts[0].initial_amount, 43200);
      assert.equal(rustPo.debts[0].due_date, nodePo.debts[0].due_date);
    }

    const stockRes = await callBoth('GET', '/api/stock', undefined, 200);
    assert.equal(stockRes.node.data.products[0].stock_milli, 115000);
    if (stockRes.rust) assert.equal(stockRes.rust.data.products[0].stock_milli, 115000);
  });

  it('Scénario 15 — Réception totale (6 casiers restants -> +144 bouteilles, CUMP & valorisation exacts)', async () => {
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/receive`,
      (_e, ctx) => ({
        request_key: 'lot9-rec-over',
        lines: [{ purchase_order_line_id: ctx.poLine, received_quantity: '7' }],
      }),
      400,
      ['INVALID_QUANTITY', 'VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'dépassement quantité commandée'
    );

    const rec2 = await callBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/receive`,
      (_e, ctx) => ({
        request_key: 'lot9-rec-2',
        notes: 'Solde commande',
        lines: [{ purchase_order_line_id: ctx.poLine, received_quantity: 6 }],
      }),
      201
    );
    assert.equal(rec2.node.data.total_amount, 64800);
    if (rec2.rust) assert.equal(rec2.rust.data.total_amount, 64800);

    // Clôture commande atteinte
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/purchases/${ctx.po}/receive`,
      (_e, ctx) => ({
        request_key: 'lot9-rec-closed',
        lines: [{ purchase_order_line_id: ctx.poLine, received_quantity: '1' }],
      }),
      400,
      ['HISTORICAL_IMMUTABLE'],
      ['HISTORICAL_IMMUTABLE'],
      'réception sur PO soldé'
    );

    const pos = await callBoth('GET', '/api/purchases', undefined, 200);
    const nodePo = pos.node.data.find((o) => o.id === ids.node.po);
    assert.equal(nodePo.status, 'received');
    assert.equal(nodePo.received_amount, 108000);
    assert.equal(nodePo.debts.length, 2);
    const nodeDebt2 = nodePo.debts.find((d) => d.id !== ids.node.debt1);
    assert.ok(nodeDebt2);
    assert.equal(nodeDebt2.initial_amount, 64800);
    ids.node.debt2 = nodeDebt2.id;

    if (pos.rust) {
      const rustPo = pos.rust.data.find((o) => o.id === ids.rust.po);
      assert.equal(rustPo.status, 'received');
      assert.equal(rustPo.received_amount, 108000);
      assert.equal(rustPo.debts.length, 2);
      const rustDebt2 = rustPo.debts.find((d) => d.id !== ids.rust.debt1);
      assert.ok(rustDebt2);
      assert.equal(rustDebt2.initial_amount, 64800);
      ids.rust.debt2 = rustDebt2.id;
    }

    const stockRes = await callBoth('GET', '/api/stock', undefined, 200);
    assert.equal(stockRes.node.data.products[0].stock_milli, 259000);
    assert.equal(stockRes.node.data.products[0].average_cost_fcfa, 450);
    assert.equal(stockRes.node.data.products[0].valuation_fcfa, 116550);
    if (stockRes.rust) {
      assert.equal(stockRes.rust.data.products[0].stock_milli, 259000);
      assert.equal(stockRes.rust.data.products[0].average_cost_fcfa, 450);
      assert.equal(stockRes.rust.data.products[0].valuation_fcfa, 116550);
    }
  });

  it('Scénario 16 — Règlement fournisseur (23 200 FCFA espèces -> reste 20 000, collision 409)', async () => {
    // Collision cross-kind (réutilisation clé paiement créance) -> 409
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/supplier-debts/${ctx.debt1}/pay`,
      { method_code: 'cash', amount: 1000, request_key: 'lot9-pay-rec-1' },
      409,
      ['DUPLICATE_OPERATION'],
      ['DUPLICATE_OPERATION'],
      'collision clé cross-kind fournisseur'
    );

    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/supplier-debts/${ctx.debt1}/pay`,
      { method_code: 'cash', amount: 50000, request_key: 'lot9-sup-over' },
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'surpaiement dette fournisseur'
    );

    const payRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/supplier-debts/${ctx.debt1}/pay`,
      { method_code: 'cash', amount: 23200, request_key: 'lot9-sup-pay-1', note: 'Acompte SOLIBRA' },
      200
    );
    expectedCash -= 23200;
    assert.equal(payRes.node.data.remaining_amount, 20000);
    assert.equal(payRes.node.data.status, 'partial');
    if (payRes.rust) {
      assert.equal(payRes.rust.data.remaining_amount, 20000);
      assert.equal(payRes.rust.data.status, 'partial');
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      (_e, ctx) => `/api/supplier-debts/${ctx.debt1}/pay`,
      { method_code: 'cash', amount: 23200, request_key: 'lot9-sup-pay-1' },
      200
    );
    assert.equal(replay.node.data.remaining_amount, 20000);
    if (replay.rust) assert.equal(replay.rust.data.remaining_amount, 20000);
  });

  it('Scénario 17 — Retour de consignation & mouvement stock vides (1 000 espèces + 1 500 déduction créance)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/consignments/returns',
      (_e, ctx) => ({
        issue_id: ctx.depositIssue,
        pieces: 1,
        condition_state: 'good',
        refund_amount: 2000,
        credit_reduction: 1000,
        method_code: 'cash',
        reason: 'Contrepartie excessive',
        request_key: 'lot9-dep-overval',
      }),
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'contrepartie retour vides > valeur'
    );

    const retRes = await callBoth(
      'POST',
      '/api/consignments/returns',
      (_e, ctx) => ({
        issue_id: ctx.depositIssue,
        pieces: 1,
        condition_state: 'good',
        refund_amount: 1000,
        credit_reduction: 1500,
        method_code: 'cash',
        reason: 'Retour 1 casier bon état Lot 9',
        request_key: 'lot9-dep-ret-1',
      }),
      201
    );
    expectedCash -= 1000;
    assert.equal(retRes.node.data.pieces, 1);
    assert.equal(retRes.node.data.refund_amount, 1000);
    assert.equal(retRes.node.data.credit_reduction, 1500);
    if (retRes.rust) {
      assert.equal(retRes.rust.data.pieces, 1);
      assert.equal(retRes.rust.data.refund_amount, 1000);
      assert.equal(retRes.rust.data.credit_reduction, 1500);
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      '/api/consignments/returns',
      (_e, ctx) => ({
        issue_id: ctx.depositIssue,
        pieces: 1,
        condition_state: 'good',
        refund_amount: 1000,
        credit_reduction: 1500,
        method_code: 'cash',
        reason: 'Retour 1 casier bon état Lot 9',
        request_key: 'lot9-dep-ret-1',
      }),
      201
    );
    assert.equal(replay.node.data.id, retRes.node.data.id);
    if (replay.rust) assert.equal(replay.rust.data.id, retRes.rust.data.id);

    // Mouvement manuel emballages consignés (+5 -> 21 + 5 = 26)
    const mvRes = await callBoth(
      'POST',
      '/api/consignments/stock-movements',
      (_e, ctx) => ({
        packaging_id: ctx.returnableType,
        movement_type: 'entry',
        quantity: 5,
        reason: 'Appoint parc casiers',
        request_key: 'lot9-ret-stk-1',
      }),
      201
    );
    assert.equal(mvRes.node.data.stock_before, 21);
    assert.equal(mvRes.node.data.stock_after, 26);
    if (mvRes.rust) {
      assert.equal(mvRes.rust.data.stock_before, 21);
      assert.equal(mvRes.rust.data.stock_after, 26);
    }

    // Vérification soldes client & créance (15 000 - 1 500 = 13 500)
    const recRes = await callBoth('GET', '/api/receivables', undefined, 200);
    const nodeRec = recRes.node.data.find((r) => r.id === ids.node.receivable);
    assert.equal(nodeRec.remaining_amount, 13500);
    if (recRes.rust) {
      const rustRec = recRes.rust.data.find((r) => r.id === ids.rust.receivable);
      assert.equal(rustRec.remaining_amount, 13500);
    }

    const consOv = await callBoth('GET', '/api/consignments', undefined, 200);
    assert.equal(consOv.node.data.clientBalances[0].balance_pieces, 1);
    assert.equal(consOv.node.data.clientBalances[0].deposit_held_amount, 2500);
    assert.equal(consOv.node.data.types[0].stock_quantity, 26);
    if (consOv.rust) {
      assert.equal(consOv.rust.data.clientBalances[0].balance_pieces, 1);
      assert.equal(consOv.rust.data.clientBalances[0].deposit_held_amount, 2500);
      assert.equal(consOv.rust.data.types[0].stock_quantity, 26);
    }
  });

  it('Scénario 18 — Inventaire physique (rejet écart non motivé & doublon, validation -2 bouteilles)', async () => {
    const invRes = await callBoth(
      'POST',
      '/api/inventories',
      { notes: 'Inventaire physique Lot 9' },
      201
    );
    ids.node.inventory = invRes.node.data.id;
    assert.equal(invRes.node.data.status, 'draft');
    assert.equal(invRes.node.data.lines[0].theoretical_milli, 259000);
    if (invRes.rust) {
      ids.rust.inventory = invRes.rust.data.id;
      assert.equal(invRes.rust.data.status, 'draft');
      assert.equal(invRes.rust.data.lines[0].theoretical_milli, 259000);
    }

    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/inventories/${ctx.inventory}/validate`,
      (_e, ctx) => ({
        lines: [{ product_id: ctx.product, counted_quantity: '257', reason: '' }],
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'écart inventaire sans motif'
    );
    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/inventories/${ctx.inventory}/validate`,
      (_e, ctx) => ({
        lines: [
          { product_id: ctx.product, counted_quantity: '259' },
          { product_id: ctx.product, counted_quantity: '259' },
        ],
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'produit dupliqué inventaire'
    );

    const valRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/inventories/${ctx.inventory}/validate`,
      (_e, ctx) => ({
        lines: [
          {
            product_id: ctx.product,
            counted_quantity: '257',
            reason: 'Casse constatée lors du comptage',
          },
        ],
      }),
      200
    );
    assert.equal(valRes.node.data.status, 'validated');
    assert.equal(valRes.node.data.lines[0].counted_milli, 257000);
    if (valRes.rust) {
      assert.equal(valRes.rust.data.status, 'validated');
      assert.equal(valRes.rust.data.lines[0].counted_milli, 257000);
    }

    await expectRejectedBoth(
      'POST',
      (_e, ctx) => `/api/inventories/${ctx.inventory}/validate`,
      (_e, ctx) => ({
        lines: [{ product_id: ctx.product, counted_quantity: '257' }],
      }),
      400,
      ['HISTORICAL_IMMUTABLE'],
      ['HISTORICAL_IMMUTABLE'],
      'revalidation inventaire interdite'
    );
  });

  it('Scénario 19 — Dépense (5 000 FCFA espèces, rejet solde insuffisant, idempotence)', async () => {
    await expectRejectedBoth(
      'POST',
      '/api/expenses',
      {
        request_key: 'lot9-exp-fail-cash',
        category: 'Carburant',
        amount: 900000,
        method_code: 'cash',
      },
      400,
      ['INVALID_PAYMENT'],
      ['INVALID_PAYMENT'],
      'dépense espèces > solde caisse'
    );

    const expRes = await callBoth(
      'POST',
      '/api/expenses',
      {
        request_key: 'lot9-exp-1',
        category: 'Carburant',
        amount: 5000,
        method_code: 'cash',
        beneficiary: 'Station Total',
        notes: 'Livraison client',
      },
      201
    );
    expectedCash -= 5000;
    assert.equal(expRes.node.data.amount, 5000);
    assert.equal(expRes.node.data.category, 'Carburant');
    assert.ok(expRes.node.data.method_label);
    if (expRes.rust) {
      assert.equal(expRes.rust.data.amount, 5000);
      assert.equal(expRes.rust.data.category, 'Carburant');
      assert.equal(expRes.rust.data.method_label, expRes.node.data.method_label);
    }

    const replay = await callBoth(
      'POST',
      '/api/expenses',
      {
        request_key: 'lot9-exp-1',
        category: 'Carburant',
        amount: 5000,
        method_code: 'cash',
      },
      201
    );
    assert.equal(replay.node.data.id, expRes.node.data.id);
    if (replay.rust) assert.equal(replay.rust.data.id, expRes.rust.data.id);
  });

  it('Scénario 20 — Clôture de caisse (écart -500 FCFA justifié, collision clé inter-session 409)', async () => {
    const cashStatus = await callBoth('GET', '/api/cash', undefined, 200);
    assert.equal(cashStatus.node.data.summary.theoreticalCash, expectedCash);
    if (cashStatus.rust) {
      assert.equal(cashStatus.rust.data.summary.theoreticalCash, expectedCash);
    }

    await expectRejectedBoth(
      'POST',
      '/api/cash/close',
      (_e, ctx) => ({
        session_id: ctx.cashSession,
        physical_cash: expectedCash - 500,
        closing_notes: '   ',
        request_key: 'lot9-close-fail-notes',
      }),
      400,
      ['VALIDATION_ERROR'],
      ['VALIDATION_ERROR'],
      'écart caisse sans motif'
    );

    const closeRes = await callBoth(
      'POST',
      '/api/cash/close',
      (_e, ctx) => ({
        session_id: ctx.cashSession,
        physical_cash: expectedCash - 500,
        closing_notes: 'Billet de 500 FCFA manquant',
        request_key: 'lot9-cash-close-1',
      }),
      200
    );
    assert.equal(closeRes.node.data.status, 'closed');
    assert.equal(closeRes.node.data.theoretical_cash, expectedCash);
    assert.equal(closeRes.node.data.physical_cash, expectedCash - 500);
    assert.equal(closeRes.node.data.difference, -500);
    if (closeRes.rust) {
      assert.equal(closeRes.rust.data.status, 'closed');
      assert.equal(closeRes.rust.data.theoretical_cash, expectedCash);
      assert.equal(closeRes.rust.data.physical_cash, expectedCash - 500);
      assert.equal(closeRes.rust.data.difference, -500);
    }

    // Rejeu idempotent
    const replay = await callBoth(
      'POST',
      '/api/cash/close',
      (_e, ctx) => ({
        session_id: ctx.cashSession,
        physical_cash: expectedCash - 500,
        closing_notes: 'Billet de 500 FCFA manquant',
        request_key: 'lot9-cash-close-1',
      }),
      200
    );
    assert.equal(replay.node.data.id, ids.node.cashSession);

    // Collision closing_key inter-session -> 409
    const sess2 = await callBoth(
      'POST',
      '/api/cash/open',
      { opening_cash: 10000, request_key: 'lot9-cash-open-2' },
      201
    );
    const s2NodeId = sess2.node.data.id;
    const s2RustId = sess2.rust ? sess2.rust.data.id : 0;

    await expectRejectedBoth(
      'POST',
      '/api/cash/close',
      (eng) => ({
        session_id: eng === 'node' ? s2NodeId : s2RustId,
        physical_cash: 10000,
        request_key: 'lot9-cash-close-1',
      }),
      409,
      ['DUPLICATE_OPERATION'],
      ['DUPLICATE_OPERATION'],
      'closing_key réutilisée sur session différente'
    );

    const close2 = await callBoth(
      'POST',
      (eng) => '/api/cash/close',
      (eng) => ({
        session_id: eng === 'node' ? s2NodeId : s2RustId,
        physical_cash: 10000,
        request_key: 'lot9-cash-close-2',
      }),
      200
    );
    assert.equal(close2.node.data.difference, 0);
    if (close2.rust) assert.equal(close2.rust.data.difference, 0);
  });

  it('Scénario 21 — Sauvegarde & vérification lecture seule (rapports & KPIs paritaires)', async () => {
    const repRes = await callBoth('GET', '/api/reports', undefined, 200);
    preBackupReportsNode = repRes.node.data;
    assert.equal(preBackupReportsNode.stock.knownValuationFcfa, 115650);
    assert.equal(preBackupReportsNode.profitability.expensesTotal, 5000);
    if (repRes.rust) {
      preBackupReportsRust = repRes.rust.data;
      assert.deepEqual(preBackupReportsRust.commercial, preBackupReportsNode.commercial);
      assert.deepEqual(preBackupReportsRust.profitability, preBackupReportsNode.profitability);
      assert.deepEqual(preBackupReportsRust.stock, preBackupReportsNode.stock);
      assert.deepEqual(preBackupReportsRust.paymentBreakdown, preBackupReportsNode.paymentBreakdown);
    }

    const dashRes = await callBoth('GET', '/api/dashboard', undefined, 200);
    if (dashRes.rust) {
      assert.equal(
        dashRes.rust.data.kpis.revenueMerchandise,
        dashRes.node.data.kpis.revenueMerchandise
      );
      assert.equal(dashRes.rust.data.kpis.depositsTotal, dashRes.node.data.kpis.depositsTotal);
      assert.equal(dashRes.rust.data.kpis.receivablesTotal, dashRes.node.data.kpis.receivablesTotal);
      assert.equal(
        dashRes.rust.data.kpis.supplierDebtsTotal,
        dashRes.node.data.kpis.supplierDebtsTotal
      );
      assert.equal(dashRes.rust.data.kpis.expensesTotal, dashRes.node.data.kpis.expensesTotal);
    }

    const bkpRes = await callBoth('POST', '/api/backups', undefined, 201);
    ids.node.backupName = bkpRes.node.data.name;
    assert.equal(bkpRes.node.data.integrity, 'ok');
    assert.equal(bkpRes.node.data.sha256.length, 64);
    if (bkpRes.rust) {
      ids.rust.backupName = bkpRes.rust.data.name;
      assert.equal(bkpRes.rust.data.integrity, 'ok');
      assert.equal(bkpRes.rust.data.sha256.length, 64);
    }

    const verifyRes = await callBoth(
      'GET',
      (_e, ctx) => `/api/backups/${ctx.backupName}/verify`,
      undefined,
      200
    );
    preBackupVerifyNode = verifyRes.node.data;
    assert.equal(preBackupVerifyNode.compatible, true);
    assert.equal(preBackupVerifyNode.integrity, 'ok');
    assert.equal(preBackupVerifyNode.foreignKeyErrors, 0);
    if (verifyRes.rust) {
      preBackupVerifyRust = verifyRes.rust.data;
      assert.equal(preBackupVerifyRust.compatible, true);
      assert.equal(preBackupVerifyRust.integrity, 'ok');
      assert.equal(preBackupVerifyRust.foreignKeyErrors, 0);
      assert.deepEqual(preBackupVerifyRust.counts, preBackupVerifyNode.counts);
    }
  });

  it('Scénario 22 — Restauration contrôlée & comparaison finale SQLite inter-moteurs', async () => {
    // Mutation post-sauvegarde devant disparaître après restauration
    const tmpCat = await callBoth(
      'POST',
      '/api/categories',
      { name: 'Catégorie Éphémère Post-Backup' },
      201
    );
    await callBoth(
      'POST',
      '/api/products',
      (eng) => ({
        name: 'Produit Éphémère Avant Restauration',
        category_id: eng === 'node' ? tmpCat.node.data.id : tmpCat.rust.data.id,
        base_unit: 'bouteille',
        initial_stock: '5',
        retail_price: 500,
      }),
      201
    );

    const beforeRestoreProds = await callBoth('GET', '/api/products', undefined, 200);
    assert.equal(beforeRestoreProds.node.data.total, 2);
    if (beforeRestoreProds.rust) assert.equal(beforeRestoreProds.rust.data.total, 2);

    const restoreRes = await callBoth(
      'POST',
      (_e, ctx) => `/api/backups/${ctx.backupName}/restore`,
      undefined,
      200
    );
    assert.equal(restoreRes.node.data.integrity, 'ok');
    assert.equal(restoreRes.node.data.foreignKeyErrors, 0);
    assert.ok(restoreRes.node.data.safetyBackup);
    assert.deepEqual(restoreRes.node.data.counts, {
      ...preBackupVerifyNode.counts,
      auditLogs: preBackupVerifyNode.counts.auditLogs + 1,
    });

    if (restoreRes.rust) {
      assert.equal(restoreRes.rust.data.integrity, 'ok');
      assert.equal(restoreRes.rust.data.foreignKeyErrors, 0);
      assert.ok(restoreRes.rust.data.safetyBackup);
      assert.deepEqual(restoreRes.rust.data.counts, {
        ...preBackupVerifyRust.counts,
        auditLogs: preBackupVerifyRust.counts.auditLogs + 1,
      });
      assert.deepEqual(restoreRes.rust.data.counts, restoreRes.node.data.counts);
    }

    const afterRestoreProds = await callBoth('GET', '/api/products', undefined, 200);
    assert.equal(afterRestoreProds.node.data.total, 1);
    assert.equal(afterRestoreProds.node.data.items[0].stock_milli, 257000);
    if (afterRestoreProds.rust) {
      assert.equal(afterRestoreProds.rust.data.total, 1);
      assert.equal(afterRestoreProds.rust.data.items[0].stock_milli, 257000);
    }

    const afterReports = await callBoth('GET', '/api/reports', undefined, 200);
    assert.deepEqual(afterReports.node.data.commercial, preBackupReportsNode.commercial);
    assert.deepEqual(afterReports.node.data.profitability, preBackupReportsNode.profitability);
    assert.deepEqual(afterReports.node.data.stock, preBackupReportsNode.stock);
    if (afterReports.rust) {
      assert.deepEqual(afterReports.rust.data.commercial, preBackupReportsNode.commercial);
      assert.deepEqual(afterReports.rust.data.profitability, preBackupReportsNode.profitability);
      assert.deepEqual(afterReports.rust.data.stock, preBackupReportsNode.stock);
    }

    // Comparaison directe des bases SQLite des deux moteurs lorsque disponible
    if (DUAL_ENGINE && RUST_DB_PATH) {
      const nDb = new DatabaseSync(nodeDbPath);
      const rDb = new DatabaseSync(RUST_DB_PATH);
      nDb.exec('PRAGMA query_only = ON;');
      rDb.exec('PRAGMA query_only = ON;');
      try {
        const snap = (db) => ({
          products: db
            .prepare(
              'SELECT reference, name, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den FROM products ORDER BY id'
            )
            .all(),
          stockMovements: db
            .prepare(
              'SELECT product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reference_document FROM stock_movements ORDER BY id'
            )
            .all(),
          sales: db
            .prepare(
              'SELECT reference, sale_type, price_tier, total_merchandise, total_deposit, total_amount, paid_amount, status FROM sales ORDER BY id'
            )
            .all(),
          receivables: db
            .prepare(
              'SELECT sale_id, client_id, initial_amount, remaining_amount, due_date, status FROM customer_receivables ORDER BY id'
            )
            .all(),
          purchaseOrders: db
            .prepare(
              'SELECT reference, supplier_id, status, total_amount, received_amount, expected_date FROM purchase_orders ORDER BY id'
            )
            .all(),
          supplierDebts: db
            .prepare(
              'SELECT supplier_id, initial_amount, remaining_amount, due_date, status FROM supplier_debts ORDER BY id'
            )
            .all(),
          cashSessions: db
            .prepare(
              'SELECT reference, status, opening_cash, theoretical_cash, physical_cash, difference FROM cash_sessions ORDER BY id'
            )
            .all(),
          cashMovements: db
            .prepare(
              'SELECT session_id, kind, method_code, direction, amount, reference_document FROM cash_movements ORDER BY id'
            )
            .all(),
          inventories: db
            .prepare('SELECT reference, status FROM inventories ORDER BY id')
            .all(),
          expenses: db
            .prepare('SELECT reference, category, amount, method_code, session_id FROM expenses ORDER BY id')
            .all(),
          returnableBalances: db
            .prepare('SELECT packaging_id, quantity FROM returnable_stock_balances ORDER BY packaging_id')
            .all(),
          clientPackAccounts: db
            .prepare(
              'SELECT client_id, returnable_id, balance_pieces, deposit_held_amount FROM customer_packaging_accounts ORDER BY client_id, returnable_id'
            )
            .all(),
          depositReturns: db
            .prepare(
              'SELECT reference, pieces, condition_state, refund_amount, credit_reduction, method_code FROM deposit_returns ORDER BY id'
            )
            .all(),
        });

        const nodeSnap = snap(nDb);
        const rustSnap = snap(rDb);
        assert.deepEqual(rustSnap, nodeSnap, 'Les états SQLite Node.js et Rust doivent être identiques');
      } finally {
        nDb.close();
        rDb.close();
      }
    }
  });

  it('Scénario 23 — Parité Node.js / Rust : catalogue brasseries (10 SOLIBRA + 10 BRASSIVOIRE), is_active et supplier_id', async () => {
    const createInactive = await callBoth(
      'POST',
      '/api/products',
      (_e, ctx) => ({
        name: 'Produit Inactif Parité 23',
        brand: 'TEST',
        category_id: ctx.category,
        supplier_id: ctx.supplier,
        base_unit: 'bouteille',
        initial_stock: 0,
        min_stock: 12,
        purchase_price: 400,
        wholesale_price: 500,
        semi_wholesale_price: 550,
        retail_price: 600,
        is_active: false,
      }),
      201
    );
    assert.equal(createInactive.node.data.is_active, 0);
    assert.equal(createInactive.node.data.supplier_id, ids.node.supplier);
    ids.node.inactive23 = createInactive.node.data.id;
    if (createInactive.rust) {
      assert.equal(createInactive.rust.data.is_active, 0);
      assert.equal(createInactive.rust.data.supplier_id, ids.rust.supplier);
      ids.rust.inactive23 = createInactive.rust.data.id;
    }

    const clearedSup = await callBoth(
      'PUT',
      (_e, ctx) => `/api/products/${ctx.inactive23}`,
      { supplier_id: null, is_active: true },
      200
    );
    assert.equal(clearedSup.node.data.supplier_id, null);
    assert.equal(clearedSup.node.data.is_active, 1);
    if (clearedSup.rust) {
      assert.equal(clearedSup.rust.data.supplier_id, null);
      assert.equal(clearedSup.rust.data.is_active, 1);
    }

    const presets0 = await callBoth('GET', '/api/products/presets', undefined, 200);
    assert.equal(presets0.node.data.items.length, 20);
    if (presets0.rust) {
      assert.deepEqual(presets0.rust.data, presets0.node.data);
    }

    const solKeys = presets0.node.data.items
      .filter((i) => i.brewery === 'SOLIBRA')
      .map((i) => i.key);
    const brvKeys = presets0.node.data.items
      .filter((i) => i.brewery === 'BRASSIVOIRE')
      .map((i) => i.key);
    assert.equal(solKeys.length, 10);
    assert.equal(brvKeys.length, 10);

    const applySolInactive = await callBoth(
      'POST',
      '/api/products/presets/apply',
      { keys: solKeys, activate: false },
      200
    );
    assert.equal(applySolInactive.node.data.created, 10);
    assert.equal(applySolInactive.node.data.reactivated, 0);
    assert.equal(applySolInactive.node.data.skipped, 0);
    assert.ok(applySolInactive.node.data.products.every((p) => p.is_active === 0));
    if (applySolInactive.rust) {
      assert.equal(applySolInactive.rust.data.created, 10);
      assert.equal(applySolInactive.rust.data.reactivated, 0);
      assert.equal(applySolInactive.rust.data.skipped, 0);
      assert.ok(applySolInactive.rust.data.products.every((p) => p.is_active === 0));
    }

    const applyMixActive = await callBoth(
      'POST',
      '/api/products/presets/apply',
      { keys: [solKeys[0], solKeys[1], ...brvKeys], activate: true },
      200
    );
    assert.equal(applyMixActive.node.data.created, 10);
    assert.equal(applyMixActive.node.data.reactivated, 2);
    assert.equal(applyMixActive.node.data.skipped, 0);
    if (applyMixActive.rust) {
      assert.equal(applyMixActive.rust.data.created, 10);
      assert.equal(applyMixActive.rust.data.reactivated, 2);
      assert.equal(applyMixActive.rust.data.skipped, 0);
    }

    const applyIdemp = await callBoth(
      'POST',
      '/api/products/presets/apply',
      { keys: [solKeys[0], solKeys[1], ...brvKeys], activate: true },
      200
    );
    assert.equal(applyIdemp.node.data.created, 0);
    assert.equal(applyIdemp.node.data.reactivated, 0);
    assert.equal(applyIdemp.node.data.skipped, 12);
    if (applyIdemp.rust) {
      assert.equal(applyIdemp.rust.data.created, 0);
      assert.equal(applyIdemp.rust.data.reactivated, 0);
      assert.equal(applyIdemp.rust.data.skipped, 12);
    }
  });
});
