import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot6-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(testDir, 'lot6.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(testDir, 'backups');

const { getDb, closeDb } = await import('../server/db.ts');
const { createApiApp, isAllowedHttpOrigin } = await import('../server/app.ts');
const {
  configureSessionTimeoutsForTest,
  resetSessionsForTest,
  ROLE_PERMISSIONS,
} = await import('../server/services/auth.ts');
const { encryptBackupBuffer, decryptBackupBuffer } = await import('../server/services/reports.ts');

let server;
let baseUrl;

async function api(route, opts = {}, token = null) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

describe('LOT 6 — Sécurité, Sessions, Concurrence PIN, Origines, RBAC & Sauvegardes Chiffrées', () => {
  before(async () => {
    const app = createApiApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    configureSessionTimeoutsForTest(null);
    resetSessionsForTest();
    server?.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('6.1 — Connexion valide, commande sans token, expiration idle/max TTL et révocation', async () => {
    // Aucun accès sans token
    const noTok = await api('/api/dashboard');
    assert.equal(noTok.status, 401);

    const setup = await api('/api/auth/setup', { method: 'POST', body: { pin: '246810' } });
    assert.equal(setup.status, 200);
    assert.ok(setup.data.token);
    assert.equal(setup.data.user.role, 'owner');

    const me = await api('/api/auth/me', {}, setup.data.token);
    assert.equal(me.status, 200);
    assert.equal(me.data.user.username, 'owner');

    // Expiration d'une session (idle 100ms)
    configureSessionTimeoutsForTest({ idleMs: 100, maxMs: 5000 });
    const loginShort = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    assert.equal(loginShort.status, 200);
    const shortToken = loginShort.data.token;

    await new Promise((r) => setTimeout(r, 150));
    const expiredCall = await api('/api/dashboard', {}, shortToken);
    assert.equal(expiredCall.status, 401);

    // Expiration TTL maximale (maxMs 120ms même avec activité)
    configureSessionTimeoutsForTest({ idleMs: 5000, maxMs: 120 });
    const loginMax = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    assert.equal(loginMax.status, 200);
    await new Promise((r) => setTimeout(r, 70));
    const midCall = await api('/api/dashboard', {}, loginMax.data.token);
    assert.equal(midCall.status, 200);
    await new Promise((r) => setTimeout(r, 70));
    const maxExpired = await api('/api/dashboard', {}, loginMax.data.token);
    assert.equal(maxExpired.status, 401);

    // Révocation immédiate via /api/auth/lock
    configureSessionTimeoutsForTest(null);
    const freshLogin = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    assert.equal(freshLogin.status, 200);
    const revokeRes = await api('/api/auth/lock', { method: 'POST' }, freshLogin.data.token);
    assert.equal(revokeRes.status, 200);
    const afterRevoke = await api('/api/dashboard', {}, freshLogin.data.token);
    assert.equal(afterRevoke.status, 401);
  });

  it('6.2 — PIN incorrect, 5 tentatives, verrouillage, concurrence atomique et déverrouillage', async () => {
    const db = getDb();
    db.prepare('UPDATE owner_security SET failed_attempts = 0, locked_until = NULL WHERE id = 1').run();

    // 8 tentatives erronées concurrentes -> compteur atomique à 5 puis 429 PIN_LOCKED
    const concurrentFails = await Promise.all(
      Array.from({ length: 8 }, () =>
        api('/api/auth/login', { method: 'POST', body: { pin: '000000' } })
      )
    );
    const statuses = concurrentFails.map((r) => r.status);
    assert.ok(statuses.includes(401), 'Doit contenir des rejets 401 initiaux');
    assert.ok(statuses.includes(429), 'Doit contenir des blocages 429 après 5 échecs');

    const secRow = db.prepare('SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1').get();
    assert.equal(secRow.failed_attempts, 5);
    assert.ok(secRow.locked_until);

    // Même le bon PIN est refusé pendant le verrouillage
    const whileLocked = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    assert.equal(whileLocked.status, 429);

    // Déverrouillage après expiration de locked_until
    db.prepare("UPDATE owner_security SET locked_until = datetime('now', '-5 seconds') WHERE id = 1").run();
    const unlocked = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    assert.equal(unlocked.status, 200);

    const resetRow = db.prepare('SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1').get();
    assert.equal(resetRow.failed_attempts, 0);
    assert.equal(resetRow.locked_until, null);
  });

  it('6.3 — Contrôle strict des origines HTTP et en-têtes proxy opt-in uniquement', async () => {
    assert.equal(isAllowedHttpOrigin('http://localhost:3000', '127.0.0.1:3000', undefined, false, ''), true);
    assert.equal(isAllowedHttpOrigin('http://[::1]:3000', '127.0.0.1:3000', undefined, false, ''), true);
    assert.equal(isAllowedHttpOrigin('http://localhost:3000.evil.com', 'localhost:3000', undefined, false, ''), false);
    assert.equal(isAllowedHttpOrigin('http://127.0.0.1.evil.com', '127.0.0.1:3000', undefined, false, ''), false);
    assert.equal(isAllowedHttpOrigin('http://user@localhost:3000', 'localhost:3000', undefined, false, ''), false);
    assert.equal(isAllowedHttpOrigin('https://proxy.example.com', '127.0.0.1:3000', 'proxy.example.com', false, ''), false);
    assert.equal(isAllowedHttpOrigin('https://proxy.example.com', '127.0.0.1:3000', 'proxy.example.com', true, ''), true);

    const login = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    const ownerTok = login.data.token;

    const spoofPrefix = await api(
      '/api/categories',
      {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1.evil.com' },
        body: { name: 'OrigineInterdite' },
      },
      ownerTok
    );
    assert.equal(spoofPrefix.status, 403);
    assert.equal(spoofPrefix.data.code, 'FORBIDDEN_ORIGIN');

    const spoofHost = await api(
      '/api/categories',
      {
        method: 'POST',
        headers: { Origin: 'https://depot.fake', 'X-Forwarded-Host': 'depot.fake' },
        body: { name: 'ProxyNonApprouvé' },
      },
      ownerTok
    );
    assert.equal(spoofHost.status, 403);
  });

  it('6.4 — Gestion des 6 rôles RBAC, permissions et traçabilité audit_logs', async () => {
    assert.equal(Object.keys(ROLE_PERMISSIONS).length, 6);
    const ownerLogin = await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } });
    const ownerTok = ownerLogin.data.token;

    // Création caissier, magasinier, comptable
    const createCashier = await api(
      '/api/auth/users',
      {
        method: 'POST',
        body: { username: 'caissier_a', displayName: 'Mariam Caisse', role: 'cashier', pin: '112233' },
      },
      ownerTok
    );
    assert.equal(createCashier.status, 201);

    const createStock = await api(
      '/api/auth/users',
      {
        method: 'POST',
        body: { username: 'magasin_a', displayName: 'Kouassi Stock', role: 'stock_manager', pin: '334455' },
      },
      ownerTok
    );
    assert.equal(createStock.status, 201);

    const createAcc = await api(
      '/api/auth/users',
      {
        method: 'POST',
        body: { username: 'compta_a', displayName: 'Adama Compta', role: 'accountant', pin: '556677' },
      },
      ownerTok
    );
    assert.equal(createAcc.status, 201);

    const cashierTok = (await api('/api/auth/login', { method: 'POST', body: { username: 'caissier_a', pin: '112233' } })).data.token;
    const stockTok = (await api('/api/auth/login', { method: 'POST', body: { username: 'magasin_a', pin: '334455' } })).data.token;
    const accTok = (await api('/api/auth/login', { method: 'POST', body: { username: 'compta_a', pin: '556677' } })).data.token;

    // Caissier : autorisé en caisse/ventes, interdit sur paramètres, sauvegardes, gestion utilisateurs
    const cashOpen = await api(
      '/api/cash/open',
      { method: 'POST', body: { opening_cash: 25000, request_key: 'lot6-cash-open-1' } },
      cashierTok
    );
    assert.equal(cashOpen.status, 201);

    assert.equal((await api('/api/settings', { method: 'PUT', body: { company_name: 'Interdit' } }, cashierTok)).status, 403);
    assert.equal((await api('/api/backups', { method: 'POST' }, cashierTok)).status, 403);
    assert.equal((await api('/api/auth/users', {}, cashierTok)).status, 403);

    // Magasinier : autorisé à créer catégorie/stock, interdit d'ouvrir caisse / créer vente
    const catOk = await api('/api/categories', { method: 'POST', body: { name: 'Lot6 Boissons' } }, stockTok);
    assert.equal(catOk.status, 201);
    assert.equal((await api('/api/sales', { method: 'POST', body: {} }, stockTok)).status, 403);

    // Comptable : autorisé à lire rapports & lister backups, interdit d'écrire/créer
    assert.equal((await api('/api/reports', {}, accTok)).status, 200);
    assert.equal((await api('/api/backups', {}, accTok)).status, 200);
    assert.equal((await api('/api/backups', { method: 'POST' }, accTok)).status, 403);

    // Vérification traçabilité actor_* dans audit_logs
    const db = getDb();
    const auditRow = db
      .prepare("SELECT actor_user_id, actor_name, actor_role FROM audit_logs WHERE action = 'OPEN_CASH' ORDER BY id DESC LIMIT 1")
      .get();
    assert.equal(auditRow.actor_name, 'Mariam Caisse');
    assert.equal(auditRow.actor_role, 'cashier');

    const prodOk = await api(
      '/api/products',
      {
        method: 'POST',
        body: {
          name: 'Lot6 Eau Minérale',
          category_id: catOk.data.id,
          base_unit: 'bouteille',
          min_stock: 10,
          max_stock: 500,
        },
      },
      stockTok
    );
    assert.equal(prodOk.status, 201);
    const prodAudit = db
      .prepare("SELECT actor_user_id, actor_name, actor_role FROM audit_logs WHERE action = 'CREATE_PRODUCT' ORDER BY id DESC LIMIT 1")
      .get();
    assert.equal(prodAudit.actor_name, 'Kouassi Stock');
    assert.equal(prodAudit.actor_role, 'stock_manager');

    // Suppression définitive produit réservée au Owner (Admin / Manager / Stock refusés -> 403)
    const createAdmin = await api(
      '/api/auth/users',
      { method: 'POST', body: { username: 'admin_del', displayName: 'Moussa Admin', role: 'admin', pin: '445566' } },
      ownerTok
    );
    assert.equal(createAdmin.status, 201);
    const adminTok = (
      await api('/api/auth/login', { method: 'POST', body: { username: 'admin_del', pin: '445566' } })
    ).data.token;
    assert.equal((await api(`/api/products/${prodOk.data.id}`, { method: 'DELETE' }, adminTok)).status, 403);
    assert.equal((await api(`/api/products/${prodOk.data.id}`, { method: 'DELETE' }, stockTok)).status, 403);
    const ownerDel = await api(`/api/products/${prodOk.data.id}`, { method: 'DELETE' }, ownerTok);
    assert.equal(ownerDel.status, 200);
    assert.equal(ownerDel.data.deleted, true);
    const delAudit = db
      .prepare("SELECT actor_role FROM audit_logs WHERE action = 'DELETE_PRODUCT' ORDER BY id DESC LIMIT 1")
      .get();
    assert.equal(delAudit.actor_role, 'owner');

    // Désactivation utilisateur révoque immédiatement sa session active
    const deactivate = await api(
      `/api/auth/users/${createCashier.data.id}/status`,
      { method: 'PUT', body: { active: false } },
      ownerTok
    );
    assert.equal(deactivate.status, 200);
    assert.equal(deactivate.data.active, false);
    assert.equal((await api('/api/sales', {}, cashierTok)).status, 401);
  });

  it('6.5 — Sauvegarde chiffrée AES-256-GCM (.dpbkp), détection altération, vérification et restauration', async () => {
    const sample = Buffer.from('SQLite format 3\0depotpro-lot6-crypto-test');
    const env = encryptBackupBuffer(sample, 'SecretDepot2026!');
    assert.equal(env.subarray(0, 8).toString('utf8'), 'DPBKP01\0');
    const dec = decryptBackupBuffer(env, 'SecretDepot2026!');
    assert.equal(dec.plaintext.compare(sample), 0);
    assert.throws(() => decryptBackupBuffer(env, 'WrongPass2026!'), /Clé de déchiffrement invalide/);
    const tampered = Buffer.from(env);
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => decryptBackupBuffer(tampered, 'SecretDepot2026!'), /Clé de déchiffrement invalide/);

    const ownerTok = (await api('/api/auth/login', { method: 'POST', body: { pin: '246810' } })).data.token;

    // Créer un client témoin avant la sauvegarde chiffrée
    const cli1 = await api(
      '/api/clients',
      { method: 'POST', body: { name: 'Client Avant Sauvegarde Chiffrée', client_type: 'particulier', credit_policy: 'forbidden' } },
      ownerTok
    );
    assert.equal(cli1.status, 201);

    const encCreated = await api(
      '/api/backups/encrypted',
      { method: 'POST', body: { passphrase: 'DepotProKey!2026' } },
      ownerTok
    );
    assert.equal(encCreated.status, 201);
    assert.match(encCreated.data.name, /\.dpbkp$/);
    assert.equal(encCreated.data.encrypted, true);

    // Liste signale encrypted: true
    const listRes = await api('/api/backups', {}, ownerTok);
    assert.equal(listRes.status, 200);
    const listed = listRes.data.find((b) => b.name === encCreated.data.name);
    assert.ok(listed);
    assert.equal(listed.encrypted, true);

    // Mauvaise clé refusée en vérification
    const badVerify = await api(
      `/api/backups/${encCreated.data.name}/verify-encrypted`,
      { method: 'POST', body: { passphrase: 'WrongKey123!' } },
      ownerTok
    );
    assert.equal(badVerify.status, 401);

    // Bonne clé acceptée
    const goodVerify = await api(
      `/api/backups/${encCreated.data.name}/verify-encrypted`,
      { method: 'POST', body: { passphrase: 'DepotProKey!2026' } },
      ownerTok
    );
    assert.equal(goodVerify.status, 200);
    assert.equal(goodVerify.data.integrity, 'ok');
    assert.equal(goodVerify.data.foreignKeyErrors, 0);

    // Créer un client supplémentaire après la sauvegarde chiffrée
    const cli2 = await api(
      '/api/clients',
      { method: 'POST', body: { name: 'Client Post Chiffrement', client_type: 'particulier', credit_policy: 'forbidden' } },
      ownerTok
    );
    assert.equal(cli2.status, 201);

    // Restauration depuis la sauvegarde chiffrée avec la bonne clé
    const restored = await api(
      `/api/backups/${encCreated.data.name}/restore-encrypted`,
      { method: 'POST', body: { passphrase: 'DepotProKey!2026' } },
      ownerTok
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.data.restored, encCreated.data.name);
    assert.equal(restored.data.integrity, 'ok');

    const clientsAfter = await api('/api/clients', {}, ownerTok);
    assert.equal(clientsAfter.status, 200);
    assert.equal(clientsAfter.data.some((c) => c.name === 'Client Avant Sauvegarde Chiffrée'), true);
    assert.equal(clientsAfter.data.some((c) => c.name === 'Client Post Chiffrement'), false);
  });
});
