import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-v3-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(tmpDir, 'test_depot.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(tmpDir, 'Sauvegardes');

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

describe('DEPOTPRO PREMIUM V3 — Scénarios métier de référence (A à L)', () => {
  let categoryId = 0;
  let supplierId = 0;
  let productId = 0;
  let pkgBouteilleId = 0;
  let pkgCasierId = 0;
  let clientLimitedId = 0;
  let creditSaleId = 0;
  let creditReceivableId = 0;
  let backupFileName = '';

  before(async () => {
    const app = createApiApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    closeDb();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Authentification : aucun PIN par défaut, création PIN 6 chiffres et rejet des accès non authentifiés', async () => {
    const unauth = await api('GET', '/api/dashboard', undefined, '');
    assert.equal(unauth.status, 401);

    const statusBefore = await api('GET', '/api/auth/status', undefined, '');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.needsSetup, true);

    const setup = await api('POST', '/api/auth/setup', { pin: '246810' }, '');
    assert.equal(setup.status, 200);
    assert.ok(setup.data.token);

    const wrongLogin = await api('POST', '/api/auth/login', { pin: '000000' }, '');
    assert.equal(wrongLogin.status, 401);

    const validLogin = await api('POST', '/api/auth/login', { pin: '246810' }, '');
    assert.equal(validLogin.status, 200);
    authToken = validLogin.data.token;
  });

  it('Scénario A — Création produit boisson et conditionnements exacts (bouteille=1, pack=6, casier=24)', async () => {
    const cats = await api('GET', '/api/categories');
    categoryId = cats.data[0].id;

    const supRes = await api('POST', '/api/suppliers', {
      name: 'Brasserie Test CI',
      phone: '+225 0102030405',
      payment_terms_days: 30,
    });
    assert.equal(supRes.status, 201);
    supplierId = supRes.data.id;

    const prodRes = await api('POST', '/api/products', {
      name: 'Flag Spéciale 65cl',
      brand: 'SOLIBRA',
      category_id: categoryId,
      supplier_id: supplierId,
      base_unit: 'bouteille',
      initial_stock: 0,
      min_stock: 24,
      purchase_price: 500,
      retail_price: 650,
      packagings: [
        {
          name: 'bouteille',
          coefficient: 1,
          purchase_price: 500,
          wholesale_price: 580,
          semi_wholesale_price: 600,
          retail_price: 650,
        },
        {
          name: 'pack',
          coefficient: 6,
          purchase_price: 3000,
          wholesale_price: 3400,
          semi_wholesale_price: 3600,
          retail_price: 3900,
        },
        {
          name: 'casier',
          coefficient: 24,
          purchase_price: 12000,
          wholesale_price: 13500,
          semi_wholesale_price: 14000,
          retail_price: 15000,
        },
      ],
    });
    assert.equal(prodRes.status, 201);
    productId = prodRes.data.id;

    const listRes = await api('GET', `/api/products?search=${encodeURIComponent('Flag Spéciale 65cl')}`);
    assert.equal(listRes.status, 200);
    const created = listRes.data.items.find((p) => p.id === productId);
    assert.ok(created);
    assert.equal(created.stock_milli, 0);
    pkgBouteilleId = created.packagings.find((p) => p.name === 'bouteille').id;
    pkgCasierId = created.packagings.find((p) => p.name === 'casier').id;
    assert.ok(pkgBouteilleId && pkgCasierId);
  });

  it('Scénario B — Commande 10 casiers (sans effet sur stock) puis réception 10 casiers -> +240 bouteilles et dette fournisseur', async () => {
    const poRes = await api('POST', '/api/purchases', {
      request_key: 'test-po-001',
      supplier_id: supplierId,
      lines: [
        {
          product_id: productId,
          packaging_id: pkgCasierId,
          quantity: 10,
          unit_price: 12000,
        },
      ],
    });
    assert.equal(poRes.status, 201);
    assert.equal(poRes.data.total_amount, 120000);
    const poId = poRes.data.id;
    const poLineId = poRes.data.lines[0].id;

    // Vérifier que le stock est toujours à 0 avant réception
    const stockBefore = await api('GET', '/api/stock');
    const prodBefore = stockBefore.data.products.find((p) => p.id === productId);
    assert.equal(prodBefore.stock_milli, 0);

    // Réception des 10 casiers = 240 bouteilles (240 000 milli-unités)
    const recRes = await api('POST', `/api/purchases/${poId}/receive`, {
      request_key: 'test-rec-001',
      lines: [{ purchase_order_line_id: poLineId, received_quantity: 10 }],
    });
    assert.equal(recRes.status, 201);

    const stockAfter = await api('GET', '/api/stock');
    const prodAfter = stockAfter.data.products.find((p) => p.id === productId);
    assert.equal(prodAfter.stock_milli, 240000);
    assert.equal(prodAfter.average_cost_fcfa, 500);

    const debtsRes = await api('GET', '/api/supplier-debts');
    const debt = debtsRes.data.find((d) => d.supplier_id === supplierId);
    assert.ok(debt);
    assert.equal(debt.initial_amount, 120000);
    assert.equal(debt.remaining_amount, 120000);
  });

  it('Scénario C — Ouverture caisse puis vente de 1 casier + 3 bouteilles -> -27 bouteilles', async () => {
    const openCash = await api('POST', '/api/cash/open', {
      opening_cash: 50000,
      request_key: 'test-cash-open-1',
    });
    assert.equal(openCash.status, 201);

    // 1 casier (15 000) + 3 bouteilles (3 * 650 = 1 950) = 16 950 FCFA
    const saleRes = await api('POST', '/api/sales', {
      request_key: 'test-sale-c-001',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [
        { product_id: productId, packaging_id: pkgCasierId, quantity: 1 },
        { product_id: productId, packaging_id: pkgBouteilleId, quantity: 3 },
      ],
      payments: [{ method_code: 'cash', amount: 16950 }],
    });
    assert.equal(saleRes.status, 201);
    assert.equal(saleRes.data.total_merchandise, 16950);

    const stockAfter = await api('GET', '/api/stock');
    const prodAfter = stockAfter.data.products.find((p) => p.id === productId);
    // 240 - 27 = 213 bouteilles (213 000 milli-unités)
    assert.equal(prodAfter.stock_milli, 213000);

    // Vérifier idempotence sur la même request_key
    const dupRes = await api('POST', '/api/sales', {
      request_key: 'test-sale-c-001',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [
        { product_id: productId, packaging_id: pkgCasierId, quantity: 1 },
        { product_id: productId, packaging_id: pkgBouteilleId, quantity: 3 },
      ],
      payments: [{ method_code: 'cash', amount: 16950 }],
    });
    assert.equal(dupRes.status, 201);
    assert.equal(dupRes.data.id, saleRes.data.id);
    const stockStill = (await api('GET', '/api/stock')).data.products.find((p) => p.id === productId);
    assert.equal(stockStill.stock_milli, 213000);
  });

  it('Scénarios D & E — Crédit client explicite 100 000 FCFA -> paiement partiel 20 000 -> reste 80 000 FCFA', async () => {
    // Création produit à 10 000 FCFA / carton pour tomber exactement sur 100 000 FCFA
    const creditProd = await api('POST', '/api/products', {
      name: 'Jus Ananas 1L',
      category_id: categoryId,
      base_unit: 'carton',
      initial_stock: 50,
      min_stock: 5,
      purchase_price: 8000,
      retail_price: 10000,
    });
    assert.equal(creditProd.status, 201);
    const cpList = await api('GET', `/api/products?search=${encodeURIComponent('Jus Ananas 1L')}`);
    const cp = cpList.data.items.find((p) => p.id === creditProd.data.id);
    const cpPkgId = cp.packagings[0].id;

    // Client interdit par défaut -> vente à crédit refusée
    const cliForbidden = await api('POST', '/api/clients', {
      name: 'Client Sans Crédit',
      client_type: 'particulier',
      credit_policy: 'forbidden',
    });
    assert.equal(cliForbidden.status, 201);
    const rejectedCredit = await api('POST', '/api/sales', {
      request_key: 'test-credit-rejected',
      client_id: cliForbidden.data.id,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: cp.id, packaging_id: cpPkgId, quantity: 1 }],
      payments: [],
    });
    assert.equal(rejectedCredit.status, 400);

    // Client avec plafond explicite 150 000 FCFA
    const cliLimited = await api('POST', '/api/clients', {
      name: 'Maquis Le Palmier',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 150000,
      payment_terms_days: 15,
    });
    assert.equal(cliLimited.status, 201);
    clientLimitedId = cliLimited.data.id;

    // Scénario D : vente à crédit de 100 000 FCFA, 0 encaissé
    const saleCredit = await api('POST', '/api/sales', {
      request_key: 'test-sale-d-credit',
      client_id: clientLimitedId,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: cp.id, packaging_id: cpPkgId, quantity: 10 }],
      payments: [],
    });
    assert.equal(saleCredit.status, 201);
    assert.equal(saleCredit.data.total_amount, 100000);
    assert.equal(saleCredit.data.paid_amount, 0);
    assert.equal(saleCredit.data.remaining_amount, 100000);
    creditSaleId = saleCredit.data.id;
    creditReceivableId = saleCredit.data.receivable_id;

    // Scénario E : paiement partiel de 20 000 FCFA -> solde restant 80 000 FCFA
    const payPart = await api('POST', `/api/receivables/${creditReceivableId}/pay`, {
      request_key: 'test-rec-pay-20k',
      parts: [{ method_code: 'wave', amount: 20000 }],
    });
    assert.equal(payPart.status, 200);
    assert.equal(payPart.data.remaining_amount, 80000);
    assert.equal(payPart.data.status, 'partial');
  });

  it('Scénario F — Paiement mixte 50 000 FCFA (10 000 espèces + 15 000 Wave + 25 000 OM) & séparation caisse', async () => {
    const pMixed = await api('POST', '/api/products', {
      name: 'Eau Minérale Pack',
      category_id: categoryId,
      base_unit: 'pack',
      initial_stock: 30,
      min_stock: 5,
      purchase_price: 2000,
      retail_price: 2500,
    });
    const pmList = await api('GET', `/api/products?search=${encodeURIComponent('Eau Minérale Pack')}`);
    const prod = pmList.data.items.find((p) => p.id === pMixed.data.id);

    const mixedSale = await api('POST', '/api/sales', {
      request_key: 'test-sale-f-mixed',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: prod.id, packaging_id: prod.packagings[0].id, quantity: 20 }],
      payments: [
        { method_code: 'cash', amount: 10000 },
        { method_code: 'wave', amount: 15000 },
        { method_code: 'orange_money', amount: 25000 },
      ],
    });
    assert.equal(mixedSale.status, 201);
    assert.equal(mixedSale.data.total_amount, 50000);
    assert.equal(mixedSale.data.paid_amount, 50000);
    assert.equal(mixedSale.data.payments.length, 3);

    // Contrôle caisse : espèces théoriques = 50 000 (fond) + 16 950 (C) + 10 000 (F cash) = 76 950 FCFA
    // Wave (20 000 + 15 000 = 35 000) et OM (25 000) ne s'ajoutent PAS au tiroir espèces !
    const cashStatus = await api('GET', '/api/cash');
    assert.equal(cashStatus.data.summary.theoreticalCash, 76950);
  });

  it('Scénario G — Annulation vente par contre-écriture (restauration stock, annulation créance, audit)', async () => {
    const cancelRes = await api('POST', `/api/sales/${creditSaleId}/cancel`, {
      reason: 'Erreur de saisie client',
      request_key: 'test-cancel-g-001',
      refund_method_code: 'wave',
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.data.status, 'cancelled');
    assert.equal(cancelRes.data.remaining_amount, 0);
    assert.ok(cancelRes.data.cancellation);
  });

  it('Scénario H — Inventaire physique avec écart obligatoire motivé et mouvement inventory_adjust', async () => {
    const invCreate = await api('POST', '/api/inventories', { notes: 'Inventaire test H' });
    assert.equal(invCreate.status, 201);
    const inv = invCreate.data;
    const targetLine = inv.lines.find((l) => l.product_id === productId);
    assert.equal(targetLine.theoretical_milli, 213000);

    // Refus si écart sans motif
    const missingReason = await api('POST', `/api/inventories/${inv.id}/validate`, {
      lines: [{ product_id: productId, counted_quantity: 210, reason: '' }],
    });
    assert.equal(missingReason.status, 400);

    // Succès avec motif explicite
    const okVal = await api('POST', `/api/inventories/${inv.id}/validate`, {
      lines: [{ product_id: productId, counted_quantity: 210, reason: '3 bouteilles cassées en réserve' }],
    });
    assert.equal(okVal.status, 200);
    assert.equal(okVal.data.status, 'validated');

    const stockAfterInv = await api('GET', '/api/stock');
    const prod = stockAfterInv.data.products.find((p) => p.id === productId);
    assert.equal(prod.stock_milli, 210000);
    assert.ok(
      stockAfterInv.data.movements.some(
        (m) => m.product_id === productId && m.movement_type === 'inventory_adjust' && m.quantity_milli === -3000
      )
    );
  });

  it('Scénario I — Sauvegarde WAL cohérente, vérification intégrité et restauration contrôlée', async () => {
    const bkpRes = await api('POST', '/api/backups');
    assert.equal(bkpRes.status, 201);
    assert.equal(bkpRes.data.integrity, 'ok');
    backupFileName = bkpRes.data.name;

    const verifyRes = await api('GET', `/api/backups/${encodeURIComponent(backupFileName)}/verify`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.integrity, 'ok');
    assert.equal(verifyRes.data.foreignKeyErrors, 0);

    // Créer un nouveau produit après sauvegarde
    const postBkpProd = await api('POST', '/api/products', {
      name: 'Produit Post-Sauvegarde Temporaire',
      category_id: categoryId,
      base_unit: 'bouteille',
      initial_stock: 10,
    });
    assert.equal(postBkpProd.status, 201);

    // Restaurer la sauvegarde prise avant ce produit
    const restoreRes = await api('POST', `/api/backups/${encodeURIComponent(backupFileName)}/restore`);
    assert.equal(restoreRes.status, 200);

    const searchAfterRestore = await api(
      'GET',
      `/api/products?search=${encodeURIComponent('Produit Post-Sauvegarde Temporaire')}`
    );
    assert.equal(searchAfterRestore.data.items.length, 0);
  });

  it('Scénario J — Retour partiel avec avoir (AVO-*), remise en stock et remboursement caisse', async () => {
    // Vente au comptant de 6 bouteilles à 650 FCFA = 3 900 FCFA
    const saleRes = await api('POST', '/api/sales', {
      request_key: 'test-sale-j-001',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: productId, packaging_id: pkgBouteilleId, quantity: 6 }],
      payments: [{ method_code: 'cash', amount: 3900 }],
    });
    assert.equal(saleRes.status, 201);
    const saleJId = saleRes.data.id;
    const saleLineId = saleRes.data.lines[0].id;

    // Retour partiel de 2 bouteilles (remboursement 1 300 FCFA, remise en stock)
    const retRes = await api('POST', `/api/sales/${saleJId}/returns`, {
      request_key: 'test-ret-j-001',
      reason: 'Client a pris 2 bouteilles de trop',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: saleLineId, base_quantity: 2 }],
    });
    assert.equal(retRes.status, 201);
    assert.equal(retRes.data.status, 'partially_returned');
    assert.equal(retRes.data.returns.length, 1);
    assert.ok(retRes.data.returns[0].credit_note_ref.startsWith('AVO-'));
    assert.equal(retRes.data.returns[0].total_amount, 1300);
    assert.equal(retRes.data.returns[0].refund_amount, 1300);

    // Vérifier que le stock est passé de 210 - 6 + 2 = 206 bouteilles
    const stockRes = await api('GET', '/api/stock');
    const prod = stockRes.data.products.find((p) => p.id === productId);
    assert.equal(prod.stock_milli, 206000);
    assert.ok(
      stockRes.data.movements.some(
        (m) => m.product_id === productId && m.movement_type === 'return_in' && m.quantity_milli === 2000
      )
    );
  });

  it('Scénario K — Consignations : vente avec profil consigne + retour client bon état et cassé', async () => {
    const typeRes = await api('POST', '/api/consignments/types', {
      code: 'CAS-SOL-24',
      name: 'Casier plastique 24T SOLIBRA',
      producer: 'SOLIBRA',
      kind: 'crate',
      deposit_value: 3500,
      initial_stock: 20,
    });
    assert.equal(typeRes.status, 201);
    const retTypeId = typeRes.data.id;

    // Associer le profil consigne au conditionnement casier du produit A
    const pkgUpd = await api('POST', `/api/products/${productId}/packagings`, {
      id: pkgCasierId,
      name: 'casier',
      coefficient: 24,
      purchase_price: 12000,
      wholesale_price: 13500,
      semi_wholesale_price: 14000,
      retail_price: 15000,
      deposit_mode: 'deposit',
      components: [{ returnable_id: retTypeId, pieces_per_pack: 1 }],
    });
    assert.equal(pkgUpd.status, 200);

    // Vente de 2 casiers à clientLimitedId : 30 000 marchandises + 7 000 consigne = 37 000 FCFA
    const cashBefore = (await api('GET', '/api/cash')).data.summary.theoreticalCash;
    const depSale = await api('POST', '/api/sales', {
      request_key: 'test-sale-k-deposit',
      client_id: clientLimitedId,
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: productId, packaging_id: pkgCasierId, quantity: 2 }],
      payments: [{ method_code: 'cash', amount: 37000 }],
    });
    assert.equal(depSale.status, 201);
    assert.equal(depSale.data.total_merchandise, 30000);
    assert.equal(depSale.data.total_deposit, 7000);
    assert.equal(depSale.data.total_amount, 37000);

    const consBefore = await api('GET', '/api/consignments');
    const issue = consBefore.data.openIssues.find((i) => i.sale_id === depSale.data.id);
    assert.ok(issue);
    assert.equal(issue.pieces, 2);

    // Retour de 1 casier en bon état (remboursement 3 500 FCFA espèces + +1 en stock vides -> 21)
    const retGood = await api('POST', '/api/consignments/returns', {
      issue_id: issue.id,
      pieces: 1,
      condition_state: 'good',
      refund_amount: 3500,
      credit_reduction: 0,
      method_code: 'cash',
      reason: 'Retour client 1 casier intact',
      request_key: 'test-dep-ret-good',
    });
    assert.equal(retGood.status, 201);

    // Retour de 1 casier endommagé (aucun remboursement, stock bon reste à 21, mouvement breakage tracé)
    const retDamaged = await api('POST', '/api/consignments/returns', {
      issue_id: issue.id,
      pieces: 1,
      condition_state: 'damaged',
      refund_amount: 0,
      credit_reduction: 0,
      method_code: 'cash',
      reason: 'Casier fendu inutilisable',
      request_key: 'test-dep-ret-damaged',
    });
    assert.equal(retDamaged.status, 201);

    const consAfter = await api('GET', '/api/consignments');
    const tAfter = consAfter.data.types.find((t) => t.id === retTypeId);
    assert.equal(tAfter.stock_quantity, 21);
    assert.equal(
      consAfter.data.clientBalances.filter((b) => b.client_id === clientLimitedId && b.returnable_id === retTypeId)
        .length,
      0
    );

    const cashAfter = (await api('GET', '/api/cash')).data.summary.theoreticalCash;
    assert.equal(cashAfter, cashBefore + 37000 - 3500);
  });

  it('Scénario L — Clôture de caisse : rejet écart sans motif, validation avec commentaire justificatif', async () => {
    const cashBefore = await api('GET', '/api/cash');
    const activeId = cashBefore.data.activeSession.id;
    const theoretical = cashBefore.data.summary.theoreticalCash;

    // Refus si écart sans closing_notes
    const badClose = await api('POST', '/api/cash/close', {
      session_id: activeId,
      physical_cash: theoretical - 500,
      closing_notes: '   ',
      request_key: 'test-close-bad',
    });
    assert.equal(badClose.status, 400);

    // Succès avec commentaire obligatoire motivé
    const okClose = await api('POST', '/api/cash/close', {
      session_id: activeId,
      physical_cash: theoretical - 500,
      closing_notes: 'Billet de 500 FCFA déchiré écarté',
      request_key: 'test-close-ok',
    });
    assert.equal(okClose.status, 200);
    assert.equal(okClose.data.status, 'closed');
    assert.equal(okClose.data.difference, -500);

    const cashAfter = await api('GET', '/api/cash');
    assert.equal(cashAfter.data.activeSession, null);
    assert.equal(cashAfter.data.history[0].id, activeId);
  });

  it('Scénario M — Endpoint /api/reports?from=...&to=... retourne dailySales agrégé par jour pour le mois en cours', async () => {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const from = `${ym}-01`;
    const to = `${ym}-${String(lastDay).padStart(2, '0')}`;

    const repRes = await api('GET', `/api/reports?from=${from}&to=${to}`);
    assert.equal(repRes.status, 200);
    assert.ok(Array.isArray(repRes.data.dailySales), 'dailySales doit être un tableau');
    assert.ok(repRes.data.dailySales.length >= 1, 'dailySales doit contenir au moins la journée de test');

    const sumDailyRev = repRes.data.dailySales.reduce((acc, d) => acc + d.revenue, 0);
    const sumDailyCount = repRes.data.dailySales.reduce((acc, d) => acc + d.count, 0);
    assert.equal(sumDailyRev, repRes.data.commercial.merchandise_revenue);
    assert.equal(sumDailyCount, repRes.data.commercial.count);

    for (const pt of repRes.data.dailySales) {
      assert.match(pt.day, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(pt.day >= from && pt.day <= to);
      assert.ok(Number.isInteger(pt.revenue));
      assert.ok(Number.isInteger(pt.collected));
    }

    // Plage vide future -> dailySales vide
    const emptyRes = await api('GET', '/api/reports?from=2099-01-01&to=2099-01-31');
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(emptyRes.data.dailySales, []);
    assert.equal(emptyRes.data.commercial.count, 0);
  });
});
