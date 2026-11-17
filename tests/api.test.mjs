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

    // Ouvrir une session de caisse pour enregistrer une dépense aujourd'hui et vérifier le filtrage par plage
    const reopenRes = await api('POST', '/api/cash/open', {
      opening_cash: 25000,
      request_key: 'test-cash-reopen-m',
    });
    assert.equal(reopenRes.status, 201);

    const expRes = await api('POST', '/api/expenses', {
      category: 'Carburant',
      notes: 'Livraison dépôt test',
      amount: 2500,
      method_code: 'wave',
      request_key: 'test-expense-report-m',
    });
    assert.equal(expRes.status, 201);

    const repRes = await api('GET', `/api/reports?from=${from}&to=${to}`);
    assert.equal(repRes.status, 200);
    assert.ok(Array.isArray(repRes.data.dailySales), 'dailySales doit être un tableau');
    assert.ok(repRes.data.dailySales.length >= 1, 'dailySales doit contenir au moins la journée de test');
    assert.ok(
      repRes.data.profitability.expensesTotal >= 2500,
      'profitability.expensesTotal doit inclure la dépense sur la période'
    );
    assert.ok(repRes.data.paymentBreakdown.length >= 1, 'paymentBreakdown doit contenir les règlements sur la période');

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

    // Plage vide future -> dailySales, profitability.expensesTotal et règlements paymentBreakdown à 0
    const emptyRes = await api('GET', '/api/reports?from=2099-01-01&to=2099-01-31');
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(emptyRes.data.dailySales, []);
    assert.equal(emptyRes.data.commercial.count, 0);
    assert.equal(emptyRes.data.profitability.expensesTotal, 0);
    assert.ok(
      emptyRes.data.paymentBreakdown.every((pm) => pm.total_in === 0 && pm.total_out === 0),
      'paymentBreakdown doit afficher 0 sur une plage vide'
    );
  });

  it('Scénario N — Export PDF 1.4 natif (/api/documents/pdf) multi-pages et encodage WinAnsi français', async () => {
    const manyLines = Array.from({ length: 42 }, (_, i) => ({
      label: `Boisson Référence Édition Spéciale #${i + 1}`,
      sublabel: 'Catégorie Bières & Boissons fraîches',
      quantity: `${i + 1} casier(s)`,
      unitPrice: 12000,
      total: (i + 1) * 12000,
    }));

    const pdfRes = await fetch(`${baseUrl}/api/documents/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        docType: 'RAPPORT DE STOCK & VALORISATION',
        reference: 'STK-2026-TEST',
        date: '17/11/2026 10:30',
        statusLabel: 'VALIDÉ',
        partyTitle: 'Dépôt',
        partyName: 'Dépôt Étoile Abidjan',
        partyDetails: 'Zone 4 — Côte d’Ivoire',
        lines: manyLines,
        summaryRows: [
          { label: 'Total références', value: '42', bold: true },
          { label: 'Valorisation estimée', value: '10 836 000 FCFA', bold: true, tone: 'success' },
        ],
        payments: [{ label: 'Espèces', amount: 50000 }],
        notes: 'Contrôle généré avec accents français : é è à ç €.',
      }),
    });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    assert.match(pdfRes.headers.get('content-disposition') || '', /\.pdf"/);

    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    const text = Buffer.from(bytes).toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'), 'Doit démarrer par %PDF-1.4');
    assert.ok(text.trimEnd().endsWith('%%EOF'), 'Doit se terminer par %%EOF');
    assert.match(text, /\/Count [2-9]\d*/, '42 lignes doivent déclencher une pagination A4 multi-pages (/Count >= 2)');
    assert.ok(text.includes('\\351'), 'Accents é doivent être encodés en octal WinAnsi (\\351)');
  });

  it('Scénario O — Téléchargement authentifié de sauvegarde, création de catégorie et ajustement stock emballages', async () => {
    const dlRes = await fetch(`${baseUrl}/api/backups/${encodeURIComponent(backupFileName)}/download`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(dlRes.status, 200);
    const dlBuf = new Uint8Array(await dlRes.arrayBuffer());
    const header = Buffer.from(dlBuf.slice(0, 15)).toString('ascii');
    assert.equal(header, 'SQLite format 3');

    const catRes = await api('POST', '/api/categories', {
      name: 'Vins & Spiritueux',
      description: 'Bouteilles consignées ou perdues',
    });
    assert.equal(catRes.status, 201);
    assert.equal(catRes.data.name, 'Vins & Spiritueux');

    const consBefore = await api('GET', '/api/consignments');
    const firstType = consBefore.data.types[0];
    const adjRes = await api('POST', '/api/consignments/stock-movements', {
      packaging_id: firstType.id,
      movement_type: 'entry',
      quantity: 5,
      reason: 'Approvisionnement casiers vides test',
      request_key: 'test-cons-adj-o-001',
    });
    assert.equal(adjRes.status, 201);
    const consAfter = await api('GET', '/api/consignments');
    const updatedType = consAfter.data.types.find((t) => t.id === firstType.id);
    assert.equal(updatedType.stock_quantity, firstType.stock_quantity + 5);
    assert.ok(Array.isArray(consAfter.data.recentMovements) && consAfter.data.recentMovements.length >= 1);
  });

  it('Scénario P — Photo produit (image_path) : enregistrement, validation et suppression', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const badImgRes = await api('POST', '/api/products', {
      name: 'Produit Photo Invalide',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '1',
      min_stock: '1',
      image_path: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    });
    assert.equal(badImgRes.status, 400);

    const createRes = await api('POST', '/api/products', {
      name: 'Produit Photo Valide',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '5',
      min_stock: '2',
      purchase_price: 500,
      retail_price: 800,
      image_path: validPng,
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.image_path, validPng);

    const prodId = createRes.data.id;
    const clearRes = await api('PUT', `/api/products/${prodId}`, {
      image_path: null,
    });
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.data.image_path, null);
  });

  it('Scénario Q — En-têtes sécurité HTTP, blocage CSRF cross-origin, paramètres étendus et rétention sauvegardes', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    assert.equal(healthRes.headers.get('x-powered-by'), null);

    // Origine tierce rejetée sur requête mutante
    const csrfRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ name: 'Bloqué' }),
    });
    assert.equal(csrfRes.status, 403);
    const csrfData = await csrfRes.json();
    assert.equal(csrfData.code, 'FORBIDDEN_ORIGIN');

    // Origine locale acceptée
    const localOriginRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        Origin: 'http://127.0.0.1:3000',
      },
      body: JSON.stringify({
        company_legal_name: 'DEPOTPRO DISTRIBUTION SARL',
        email: 'contact@depotpro.local',
        country: "Côte d'Ivoire",
        order_prefix: 'BC',
        receipt_prefix: 'BR',
        credit_note_prefix: 'AV',
        purchase_prefix: 'AC',
      }),
    });
    assert.equal(localOriginRes.status, 200);
    const settingsPayload = await localOriginRes.json();
    assert.equal(settingsPayload.settings.company_legal_name, 'DEPOTPRO DISTRIBUTION SARL');
    assert.equal(settingsPayload.settings.order_prefix, 'BC');
    assert.equal(settingsPayload.settings.credit_note_prefix, 'AV');

    // Rétention automatique : créer 32 fichiers fictifs + 1 vraie sauvegarde -> <= 30 conservées
    const backupDir = process.env.DEPOTPRO_BACKUP_DIR;
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 0; i < 32; i += 1) {
      const stalePath = path.join(backupDir, `depotpro_backup_202501010000${String(i).padStart(2, '0')}_stale${i}.db`);
      fs.writeFileSync(stalePath, 'dummy');
      const t = new Date(Date.now() - (60 - i) * 60_000);
      fs.utimesSync(stalePath, t, t);
    }
    const bkpAfterRetention = await api('POST', '/api/backups');
    assert.equal(bkpAfterRetention.status, 201);
    const listAfterRetention = await api('GET', '/api/backups');
    assert.ok(listAfterRetention.data.length <= 30);
    assert.equal(listAfterRetention.data[0].name, bkpAfterRetention.data.name);

    // Vérifier aussi que /api/auth/change-pin est protégé par le rate limiter (429 RATE_LIMITED > 25 appels/60s)
    let rateLimited = false;
    for (let i = 0; i < 30; i += 1) {
      const r = await api('POST', '/api/auth/change-pin', {
        currentPin: '000000',
        newPin: '123456',
      });
      if (r.status === 429) {
        assert.equal(r.data.code, 'RATE_LIMITED');
        rateLimited = true;
        break;
      }
    }
    assert.equal(rateLimited, true);
  });

  it('Scénario R — Ajustement manuel du stock audité (/api/stock/adjust) : validation, idempotence et traçabilité', async () => {
    const prodRes = await api('POST', '/api/products', {
      name: 'Jus Mangue Ajustable',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '10',
      min_stock: '2',
      purchase_price: 500,
      retail_price: 800,
    });
    assert.equal(prodRes.status, 201);
    const prodId = prodRes.data.id;

    // 1. Motif manquant ou trop court rejeté
    const badReason = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'out',
      quantity: '1',
      reason: 'ok',
      request_key: 'adj-bad-reason',
    });
    assert.equal(badReason.status, 400);

    // 2. Sortie supérieure au stock bloqué quand allow_negative_stock = 0
    const overOut = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'out',
      quantity: '25',
      reason: 'Sortie impossible test',
      request_key: 'adj-over-out',
    });
    assert.equal(overOut.status, 400);
    assert.equal(overOut.data.code, 'INSUFFICIENT_STOCK');

    // 3. Sortie fractionnaire valide (0.5 bouteille) -> ADJ-YYYY-NNNNN + CUMP préservé
    const outRes = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'out',
      quantity: '0.5',
      reason: 'Casse manutention entrepôt',
      request_key: 'adj-out-001',
    });
    assert.equal(outRes.status, 201);
    assert.equal(outRes.data.movement_type, 'manual_adjust');
    assert.equal(outRes.data.quantity_milli, -500);
    assert.equal(outRes.data.stock_before_milli, 10000);
    assert.equal(outRes.data.stock_after_milli, 9500);
    assert.match(outRes.data.reference_document, /^ADJ-\d{4}-\d{5}$/);

    // 4. Rejeu idempotent avec même request_key : ne déduit pas deux fois
    const replayRes = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'out',
      quantity: '0.5',
      reason: 'Casse manutention entrepôt',
      request_key: 'adj-out-001',
    });
    assert.equal(replayRes.status, 201);
    assert.equal(replayRes.data.id, outRes.data.id);

    // 5. Entrée manuelle (surplus) -> 9500 + 2000 = 11500
    const inRes = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'in',
      quantity: '2',
      reason: 'Surplus retrouvé palette fond',
      request_key: 'adj-in-001',
    });
    assert.equal(inRes.status, 201);
    assert.equal(inRes.data.stock_before_milli, 9500);
    assert.equal(inRes.data.stock_after_milli, 11500);

    const stockOverview = await api('GET', '/api/stock');
    const updated = stockOverview.data.products.find((p) => p.id === prodId);
    assert.equal(updated.stock_milli, 11500);

    // 6. Produit archivé refusé
    await api('PUT', `/api/products/${prodId}`, { is_active: false });
    const archivedAdj = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'out',
      quantity: '1',
      reason: 'Test archivé',
      request_key: 'adj-archived',
    });
    assert.equal(archivedAdj.status, 400);
  });

  it('Scénario S — Édition complète Clients & Fournisseurs, édition conditionnements existants & PDF rapports dédiés', async () => {
    // 1. Création et édition complète Client
    const cliCreate = await api('POST', '/api/clients', {
      name: 'Maquis Étoile',
      client_type: 'professionnel',
      phone: '+225 07 11 22 33 44',
      address: 'Rue des Jardins',
      city: 'Abidjan',
      email: 'etoile@example.ci',
      contact_person: 'M. Koné',
      credit_policy: 'limited',
      credit_limit: 250000,
      payment_terms_days: 15,
    });
    assert.equal(cliCreate.status, 201);
    const cliId = cliCreate.data.id;

    const badCliUpd = await api('PUT', `/api/clients/${cliId}`, { name: '   ' });
    assert.equal(badCliUpd.status, 400);

    const cliUpd = await api('PUT', `/api/clients/${cliId}`, {
      name: 'Maquis Étoile Plus',
      client_type: 'professionnel',
      phone: '+225 07 99 88 77 66',
      address: 'Boulevard Latrille',
      city: 'Cocody',
      email: 'contact@etoileplus.ci',
      contact_person: 'Mme Bamba',
      is_active: true,
    });
    assert.equal(cliUpd.status, 200);
    assert.equal(cliUpd.data.name, 'Maquis Étoile Plus');
    assert.equal(cliUpd.data.phone, '+225 07 99 88 77 66');
    assert.equal(cliUpd.data.address, 'Boulevard Latrille');
    assert.equal(cliUpd.data.city, 'Cocody');
    assert.equal(cliUpd.data.email, 'contact@etoileplus.ci');
    assert.equal(cliUpd.data.contact_person, 'Mme Bamba');
    assert.equal(cliUpd.data.credit_policy, 'limited');
    assert.equal(cliUpd.data.credit_limit, 250000);

    // 2. Création et édition complète Fournisseur
    const supCreate = await api('POST', '/api/suppliers', {
      name: 'DistriBoissons CI',
      company_name: 'DistriBoissons SARL',
      phone: '+225 27 20 00 11 22',
      address: 'Zone 4C',
      email: 'achats@distri.ci',
      contact_person: 'M. Yao',
      payment_terms_days: 30,
    });
    assert.equal(supCreate.status, 201);
    const supId = supCreate.data.id;

    const badSupUpd = await api('PUT', `/api/suppliers/${supId}`, { payment_terms_days: -5 });
    assert.equal(badSupUpd.status, 400);

    const supUpd = await api('PUT', `/api/suppliers/${supId}`, {
      name: 'DistriBoissons Premium',
      company_name: 'DistriBoissons Premium SA',
      phone: '+225 27 20 99 88 77',
      address: 'Yopougon ZI',
      email: 'commercial@distripremium.ci',
      contact_person: 'Mme Kouassi',
      payment_terms_days: 45,
      is_active: true,
    });
    assert.equal(supUpd.status, 200);
    assert.equal(supUpd.data.name, 'DistriBoissons Premium');
    assert.equal(supUpd.data.address, 'Yopougon ZI');
    assert.equal(supUpd.data.email, 'commercial@distripremium.ci');
    assert.equal(supUpd.data.contact_person, 'Mme Kouassi');
    assert.equal(supUpd.data.payment_terms_days, 45);

    // 3. Édition complète d'un conditionnement existant + blocage doublon
    const prodPkg = await api('POST', '/api/products', {
      name: 'Soda Test Conditionnement',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '48',
      min_stock: '12',
      purchase_price: 300,
      retail_price: 500,
      packagings: [
        {
          name: 'casier',
          coefficient: '24',
          purchase_price: 7200,
          wholesale_price: 9600,
          semi_wholesale_price: 10200,
          retail_price: 11000,
          barcode: '321999000111',
        },
      ],
    });
    assert.equal(prodPkg.status, 201);
    const prodsList = await api('GET', '/api/products?search=Soda%20Test%20Conditionnement');
    const createdProd = prodsList.data.items.find((p) => p.id === prodPkg.data.id);
    const existingCasier = createdProd.packagings.find((pk) => pk.name === 'casier');
    assert.ok(existingCasier);

    // Doublon sans id rejeté proprement (DUPLICATE_OPERATION)
    const dupPkgRes = await api('POST', `/api/products/${createdProd.id}/packagings`, {
      name: 'casier',
      coefficient: '24',
      retail_price: 12000,
    });
    assert.equal(dupPkgRes.status, 400);
    assert.equal(dupPkgRes.data.code, 'DUPLICATE_OPERATION');

    // Mise à jour complète avec id
    const updPkgRes = await api('POST', `/api/products/${createdProd.id}/packagings`, {
      id: existingCasier.id,
      name: 'casier',
      coefficient: '24',
      purchase_price: 7500,
      wholesale_price: 10000,
      semi_wholesale_price: 10800,
      retail_price: 11500,
      barcode: '321999000222',
      allow_fraction: true,
      is_active: true,
      deposit_mode: 'none',
    });
    assert.equal(updPkgRes.status, 200);
    assert.equal(updPkgRes.data.purchase_price, 7500);
    assert.equal(updPkgRes.data.retail_price, 11500);
    assert.equal(updPkgRes.data.barcode, '321999000222');
    assert.equal(updPkgRes.data.allow_fraction, 1);

    // 4. Génération PDF natif pour les nouveaux types de rapports dédiés
    for (const docType of [
      'BILAN COMMERCIAL & FINANCES',
      'ÉTAT DES DETTES FOURNISSEURS',
      'ÉTAT DES CONSIGNATIONS',
    ]) {
      const pdfRes = await fetch(`${baseUrl}/api/documents/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          docType,
          reference: `TEST-${docType.slice(0, 5)}`,
          date: '17/11/2026 12:00',
          statusLabel: 'CONTRÔLE',
          lines: [
            { label: 'Ligne test 1', sublabel: 'Détail test', quantity: '10', unitPrice: 1000, total: 10000 },
          ],
          summaryRows: [{ label: 'Total test', value: '10 000 FCFA', bold: true }],
        }),
      });
      assert.equal(pdfRes.status, 200, `${docType} doit générer un PDF 200 OK`);
      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
      assert.ok(Buffer.from(pdfBytes).toString('latin1').startsWith('%PDF-1.4'));
    }
  });

  it('Scénario T — Logo personnalisé entreprise (settings.logo_path) et remboursement multi-canal (Wave)', async () => {
    const validLogo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const badLogo = await api('PUT', '/api/settings', {
      logo_path: 'https://external.example/logo.png',
    });
    assert.equal(badLogo.status, 400);
    assert.equal(badLogo.data.code, 'VALIDATION_ERROR');

    const saveLogo = await api('PUT', '/api/settings', {
      logo_path: validLogo,
    });
    assert.equal(saveLogo.status, 200);
    assert.equal(saveLogo.data.settings.logo_path, validLogo);

    const readSettings = await api('GET', '/api/settings');
    assert.equal(readSettings.status, 200);
    assert.equal(readSettings.data.settings.logo_path, validLogo);

    const clearLogo = await api('PUT', '/api/settings', {
      logo_path: null,
    });
    assert.equal(clearLogo.status, 200);
    assert.equal(clearLogo.data.settings.logo_path, null);

    // S'assurer qu'une session de caisse est ouverte pour tester la vente + annulation Wave
    const cashCheck = await api('GET', '/api/cash');
    if (!cashCheck.data.activeSession) {
      const openCash = await api('POST', '/api/cash/open', {
        opening_cash: 10000,
        request_key: 'open-cash-scen-t',
      });
      assert.equal(openCash.status, 201);
    }

    const prodRes = await api('POST', '/api/products', {
      name: 'Produit Remboursement Wave',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '10',
      min_stock: '2',
      purchase_price: 400,
      retail_price: 700,
    });
    assert.equal(prodRes.status, 201);
    const prods = await api('GET', '/api/products?search=Produit%20Remboursement%20Wave');
    const prod = prods.data.items.find((p) => p.id === prodRes.data.id);
    const pkg = prod.packagings[0];

    const saleRes = await api('POST', '/api/sales', {
      request_key: 'sale-wave-refund-t',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [
        {
          product_id: prod.id,
          packaging_id: pkg.id,
          quantity: '2',
          discount_amount: 0,
        },
      ],
      payments: [{ method_code: 'wave', amount: 1400 }],
    });
    assert.equal(saleRes.status, 201);

    const cancelWave = await api('POST', `/api/sales/${saleRes.data.id}/cancel`, {
      reason: 'Erreur client Wave',
      refund_method_code: 'wave',
      request_key: 'cancel-wave-refund-t',
    });
    assert.equal(cancelWave.status, 200);
    assert.equal(cancelWave.data.status, 'cancelled');

    const cashAfter = await api('GET', '/api/cash');
    const waveMov = cashAfter.data.summary.movements.find(
      (m) => m.reference_document === saleRes.data.reference && m.direction === 'out'
    );
    assert.ok(waveMov, 'Un mouvement de remboursement Wave doit apparaître en caisse');
    assert.equal(waveMov.method_code, 'wave');
    assert.equal(waveMov.amount, 1400);
  });

  it('Scénario U — Annulation bon de commande non réceptionné (POST /api/purchases/:id/cancel) & alertes échéances dépassées', async () => {
    const sup = await api('POST', '/api/suppliers', {
      name: 'Fournisseur Annulation PO',
      phone: '+225 07 55 44 33 22',
      payment_terms_days: 30,
    });
    assert.equal(sup.status, 201);

    const prods = await api('GET', '/api/products?pageSize=20');
    const prod = prods.data.items.find((p) => p.packagings.length > 0 && p.stock_milli > 5000);
    assert.ok(prod);
    const pkg = prod.packagings[0];

    const po = await api('POST', '/api/purchases', {
      request_key: 'po-u-cancel-1',
      supplier_id: sup.data.id,
      notes: 'Commande test U',
      lines: [
        {
          product_id: prod.id,
          packaging_id: pkg.id,
          quantity: '5',
          unit_price: 500,
        },
      ],
    });
    assert.equal(po.status, 201);

    // Rejet sans motif
    const emptyCancel = await api('POST', `/api/purchases/${po.data.id}/cancel`, {
      reason: '   ',
    });
    assert.equal(emptyCancel.status, 400);

    // Annulation valide
    const cancelled = await api('POST', `/api/purchases/${po.data.id}/cancel`, {
      reason: 'Rupture fournisseur test U',
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.status, 'cancelled');
    assert.ok(cancelled.data.notes.includes('Rupture fournisseur test U'));

    // Rejet double annulation
    const doubleCancel = await api('POST', `/api/purchases/${po.data.id}/cancel`, {
      reason: 'Double annulation',
    });
    assert.equal(doubleCancel.status, 400);
    assert.equal(doubleCancel.data.code, 'HISTORICAL_IMMUTABLE');

    // Rejet annulation après réception partielle
    const po2 = await api('POST', '/api/purchases', {
      request_key: 'po-u-rec-2',
      supplier_id: sup.data.id,
      lines: [
        {
          product_id: prod.id,
          packaging_id: pkg.id,
          quantity: '4',
          unit_price: 500,
        },
      ],
    });
    assert.equal(po2.status, 201);
    const rec = await api('POST', `/api/purchases/${po2.data.id}/receive`, {
      request_key: 'rec-u-2',
      lines: [
        {
          purchase_order_line_id: po2.data.lines[0].id,
          received_quantity: '2',
        },
      ],
    });
    assert.equal(rec.status, 201);
    const cancelReceived = await api('POST', `/api/purchases/${po2.data.id}/cancel`, {
      reason: 'Après réception',
    });
    assert.equal(cancelReceived.status, 400);
    assert.equal(cancelReceived.data.code, 'HISTORICAL_IMMUTABLE');

    // Échéance dépassée remontée dans /api/dashboard
    const cli = await api('POST', '/api/clients', {
      name: 'Client Échéance Dépassée U',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 50000,
      payment_terms_days: 15,
    });
    assert.equal(cli.status, 201);
    const saleOverdue = await api('POST', '/api/sales', {
      request_key: 'sale-u-overdue-1',
      client_id: cli.data.id,
      sale_type: 'credit',
      price_tier: 'retail',
      due_date: '2024-01-10',
      lines: [
        {
          product_id: prod.id,
          packaging_id: pkg.id,
          quantity: '1',
          discount_amount: 0,
        },
      ],
      payments: [],
    });
    assert.equal(saleOverdue.status, 201);

    const dash = await api('GET', '/api/dashboard');
    assert.equal(dash.status, 200);
    assert.ok(dash.data.kpis.overdueReceivablesCount >= 1);
    assert.ok(dash.data.kpis.overdueReceivablesTotal >= saleOverdue.data.total_amount);
    assert.equal(typeof dash.data.kpis.overdueSupplierDebtsCount, 'number');
    assert.equal(typeof dash.data.kpis.overdueSupplierDebtsTotal, 'number');
  });

  it('Scénario V — Justificatif de dépense (expenses.receipt_path) : validation, persistance et liste', async () => {
    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const cash = await api('GET', '/api/cash');
    if (!cash.data.activeSession) {
      const openCash = await api('POST', '/api/cash/open', {
        opening_cash: 25000,
        request_key: 'open-cash-scen-v',
      });
      assert.equal(openCash.status, 201);
    }

    // Rejet format receipt_path externe non sécurisé
    const badReceipt = await api('POST', '/api/expenses', {
      request_key: 'exp-v-bad',
      category: 'Carburant & Livraison',
      amount: 1500,
      method_code: 'cash',
      receipt_path: 'https://evil.example/fake.png',
    });
    assert.equal(badReceipt.status, 400);
    assert.equal(badReceipt.data.code, 'VALIDATION_ERROR');

    // Enregistrement avec justificatif PNG local
    const okExp = await api('POST', '/api/expenses', {
      request_key: 'exp-v-ok',
      category: 'Carburant & Livraison',
      amount: 3500,
      method_code: 'cash',
      beneficiary: 'Station Shell',
      notes: 'Plein moto livraison',
      receipt_path: validPng,
    });
    assert.equal(okExp.status, 201);
    assert.equal(okExp.data.receipt_path, validPng);

    // Enregistrement sans justificatif -> null
    const noReceiptExp = await api('POST', '/api/expenses', {
      request_key: 'exp-v-none',
      category: 'Divers',
      amount: 1000,
      method_code: 'cash',
    });
    assert.equal(noReceiptExp.status, 201);
    assert.equal(noReceiptExp.data.receipt_path, null);

    const listRes = await api('GET', '/api/expenses');
    assert.equal(listRes.status, 200);
    const found = listRes.data.items.find((e) => e.id === okExp.data.id);
    assert.ok(found);
    assert.equal(found.receipt_path, validPng);
  });

  it('Scénario W — Filtrage par plage de dates (from / to) sur GET /api/sales', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const allToday = await api('GET', `/api/sales?from=${today}&to=${today}&pageSize=50`);
    assert.equal(allToday.status, 200);
    assert.ok(allToday.data.total >= 1, 'Des ventes créées aujourd’hui doivent remonter');
    assert.ok(
      allToday.data.items.every((s) => s.created_at.slice(0, 10) === today),
      'Toutes les ventes filtrées doivent correspondre à la date du jour'
    );

    const pastOnly = await api('GET', '/api/sales?from=2020-01-01&to=2020-12-31');
    assert.equal(pastOnly.status, 200);
    assert.equal(pastOnly.data.total, 0);
    assert.equal(pastOnly.data.items.length, 0);

    const futureOnly = await api('GET', '/api/sales?from=2099-01-01');
    assert.equal(futureOnly.status, 200);
    assert.equal(futureOnly.data.total, 0);
  });

  it('Scénario X — Persistance de session multi-canal (X-DepotPro-Token & cookie HttpOnly depotpro_session)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '246810' }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('depotpro_session='), 'Cookie session HttpOnly attendu');
    assert.ok(setCookie.includes('HttpOnly'));
    const cookiePair = setCookie.split(';')[0];
    const loginData = await loginRes.json();
    assert.ok(loginData.token);

    // Authentification via X-DepotPro-Token sans Authorization (cas proxy filtrant Authorization)
    const xHdrRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { 'X-DepotPro-Token': loginData.token },
    });
    assert.equal(xHdrRes.status, 200);

    // Authentification via cookie depotpro_session + statut authenticated=true
    const statusCookie = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { Cookie: cookiePair },
    }).then((r) => r.json());
    assert.equal(statusCookie.authenticated, true);

    const dashCookie = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(dashCookie.status, 200);

    // Verrouillage via cookie révoque la session et efface le cookie
    const lockRes = await fetch(`${baseUrl}/api/auth/lock`, {
      method: 'POST',
      headers: { Cookie: cookiePair },
    });
    assert.equal(lockRes.status, 200);
    assert.ok((lockRes.headers.get('set-cookie') || '').includes('Max-Age=0'));

    const afterLock = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { 'X-DepotPro-Token': loginData.token },
    });
    assert.equal(afterLock.status, 401);
  });
});
