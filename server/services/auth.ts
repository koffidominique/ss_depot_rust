import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, withWriteTx, auditLog, getCurrentActor, type ActorContext } from '../db.ts';
import { BusinessError } from '../domain.ts';

export type Role = 'owner' | 'admin' | 'manager' | 'cashier' | 'stock_manager' | 'accountant';

export type Permission =
  | 'catalog:read'
  | 'catalog:write'
  | 'catalog:delete'
  | 'sales:read'
  | 'sales:write'
  | 'sales:cancel_return'
  | 'receivables:read'
  | 'receivables:pay'
  | 'purchases:read'
  | 'purchases:write'
  | 'supplier_debts:pay'
  | 'stock:read'
  | 'stock:adjust'
  | 'inventory:validate'
  | 'consignments:read'
  | 'consignments:write'
  | 'cash:read'
  | 'cash:operate'
  | 'expenses:write'
  | 'reports:read'
  | 'settings:read'
  | 'settings:write'
  | 'backups:read'
  | 'backups:create'
  | 'backups:restore'
  | 'security:manage_users'
  | 'security:change_owner_pin';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'catalog:read',
  'catalog:write',
  'catalog:delete',
  'sales:read',
  'sales:write',
  'sales:cancel_return',
  'receivables:read',
  'receivables:pay',
  'purchases:read',
  'purchases:write',
  'supplier_debts:pay',
  'stock:read',
  'stock:adjust',
  'inventory:validate',
  'consignments:read',
  'consignments:write',
  'cash:read',
  'cash:operate',
  'expenses:write',
  'reports:read',
  'settings:read',
  'settings:write',
  'backups:read',
  'backups:create',
  'backups:restore',
  'security:manage_users',
  'security:change_owner_pin',
] as const;

export const ROLE_LABELS_FR: Record<Role, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  manager: 'Responsable',
  cashier: 'Caissier',
  stock_manager: 'Gestionnaire de stock',
  accountant: 'Comptable',
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter(
    (p) => p !== 'security:change_owner_pin' && p !== 'catalog:delete'
  ),
  manager: [
    'catalog:read',
    'catalog:write',
    'sales:read',
    'sales:write',
    'sales:cancel_return',
    'receivables:read',
    'receivables:pay',
    'purchases:read',
    'purchases:write',
    'supplier_debts:pay',
    'stock:read',
    'stock:adjust',
    'inventory:validate',
    'consignments:read',
    'consignments:write',
    'cash:read',
    'cash:operate',
    'expenses:write',
    'reports:read',
    'settings:read',
    'backups:read',
    'backups:create',
  ],
  cashier: [
    'catalog:read',
    'sales:read',
    'sales:write',
    'sales:cancel_return',
    'receivables:read',
    'receivables:pay',
    'consignments:read',
    'consignments:write',
    'cash:read',
    'cash:operate',
    'expenses:write',
    'settings:read',
  ],
  stock_manager: [
    'catalog:read',
    'catalog:write',
    'purchases:read',
    'purchases:write',
    'stock:read',
    'stock:adjust',
    'inventory:validate',
    'consignments:read',
    'consignments:write',
    'settings:read',
  ],
  accountant: [
    'catalog:read',
    'sales:read',
    'receivables:read',
    'purchases:read',
    'stock:read',
    'consignments:read',
    'cash:read',
    'reports:read',
    'settings:read',
    'backups:read',
  ],
};

export interface SessionIdentity extends ActorContext {
  role: Role;
  roleLabel: string;
  permissions: readonly Permission[];
}

export interface SessionRecord {
  token: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  identity: SessionIdentity;
  revoked: boolean;
}

export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  roleLabel: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;

function readPositiveEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let sessionIdleTimeoutMs = readPositiveEnvMs(
  'DEPOTPRO_SESSION_IDLE_MS',
  readPositiveEnvMs('DEPOTPRO_SESSION_IDLE_SECS', 0) * 1000 || DEFAULT_IDLE_TIMEOUT_MS
);
let sessionMaxLifetimeMs = readPositiveEnvMs(
  'DEPOTPRO_SESSION_MAX_MS',
  readPositiveEnvMs('DEPOTPRO_SESSION_MAX_SECS', 0) * 1000 || DEFAULT_MAX_LIFETIME_MS
);

const activeSessions = new Map<string, SessionRecord>();

export function configureSessionTimeoutsForTest(
  opts: { idleMs?: number; maxMs?: number } | null
): void {
  if (!opts) {
    sessionIdleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
    sessionMaxLifetimeMs = DEFAULT_MAX_LIFETIME_MS;
    return;
  }
  if (typeof opts.idleMs === 'number' && opts.idleMs > 0) {
    sessionIdleTimeoutMs = opts.idleMs;
  }
  if (typeof opts.maxMs === 'number' && opts.maxMs > 0) {
    sessionMaxLifetimeMs = opts.maxMs;
  }
}

export function resetSessionsForTest(): void {
  activeSessions.clear();
  sessionIdleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
  sessionMaxLifetimeMs = DEFAULT_MAX_LIFETIME_MS;
}

export function isValidRole(role: string): role is Role {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'manager' ||
    role === 'cashier' ||
    role === 'stock_manager' ||
    role === 'accountant'
  );
}

export function buildSessionIdentity(
  userId: string,
  username: string,
  displayName: string,
  role: Role
): SessionIdentity {
  return {
    userId,
    username,
    displayName,
    role,
    roleLabel: ROLE_LABELS_FR[role],
    permissions: ROLE_PERMISSIONS[role],
  };
}

export function hasPermission(identity: { role: string }, permission: Permission): boolean {
  if (!isValidRole(identity.role)) return false;
  return ROLE_PERMISSIONS[identity.role].includes(permission);
}

export function requirePermission(identity: { role: string }, permission: Permission): void {
  if (!hasPermission(identity, permission)) {
    const label = isValidRole(identity.role) ? ROLE_LABELS_FR[identity.role] : identity.role;
    throw new BusinessError(
      'FORBIDDEN',
      `Accès refusé pour le rôle ${label} : permission requise (${permission}).`,
      403
    );
  }
}

export function requireCurrentActorPermission(permission: Permission): void {
  const actor = getCurrentActor();
  if (actor) {
    requirePermission(actor, permission);
  }
}

function parseTimestampMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

export function validatePinFormat(pin: string): void {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    throw new BusinessError('VALIDATION_ERROR', 'Le code PIN doit contenir exactement 6 chiffres.');
  }
}

function validateUsername(username: string): string {
  if (typeof username !== 'string') {
    throw new BusinessError('VALIDATION_ERROR', "L'identifiant utilisateur est requis.");
  }
  const clean = username.trim().toLowerCase();
  if (clean.length < 3 || clean.length > 32) {
    throw new BusinessError(
      'VALIDATION_ERROR',
      "L'identifiant utilisateur doit contenir entre 3 et 32 caractères."
    );
  }
  if (!/^[a-z0-9._-]+$/.test(clean)) {
    throw new BusinessError(
      'VALIDATION_ERROR',
      "L'identifiant utilisateur ne peut contenir que lettres minuscules, chiffres, '.', '_' ou '-'."
    );
  }
  if (clean === 'owner') {
    throw new BusinessError(
      'VALIDATION_ERROR',
      "L'identifiant 'owner' est réservé au compte Propriétaire."
    );
  }
  return clean;
}

export function getAuthStatus(): {
  needsSetup: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
} {
  const db = getDb();
  const row = db
    .prepare('SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1')
    .get() as { failed_attempts: number; locked_until: string | null } | undefined;
  if (!row) {
    return { needsSetup: true, lockedUntil: null, failedAttempts: 0 };
  }
  const lockMs = parseTimestampMs(row.locked_until);
  const lockedUntil = lockMs > Date.now() ? row.locked_until : null;
  return {
    needsSetup: false,
    lockedUntil,
    failedAttempts: row.failed_attempts,
  };
}

export async function setupOwnerPin(
  pin: string
): Promise<{ token: string; user: SessionIdentity }> {
  validatePinFormat(pin);
  const hash = await bcrypt.hash(pin, 10);
  await withWriteTx((db) => {
    const existing = db.prepare('SELECT id FROM owner_security WHERE id = 1').get();
    if (existing) {
      throw new BusinessError('VALIDATION_ERROR', 'Un code PIN propriétaire est déjà configuré.');
    }
    db.prepare('INSERT INTO owner_security (id, pin_hash, failed_attempts) VALUES (1, ?, 0)').run(
      hash
    );
    db.prepare(
      `INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts)
       VALUES ('owner', 'Propriétaire', 'owner', ?, 1, 0)
       ON CONFLICT(username) DO UPDATE SET pin_hash = excluded.pin_hash, active = 1, failed_attempts = 0, locked_until = NULL`
    ).run(hash);
    auditLog(db, 'PIN_SETUP', 'owner_security', 1, 'Configuration initiale du PIN propriétaire');
  });
  const user = buildSessionIdentity('owner', 'owner', 'Propriétaire', 'owner');
  const { token } = issueToken(user);
  return { token, user };
}

export async function loginOwner(pin: string): Promise<{ token: string; user: SessionIdentity }> {
  return loginUser('owner', pin);
}

export async function loginUser(
  username: string | undefined,
  pin: string
): Promise<{ token: string; user: SessionIdentity }> {
  validatePinFormat(pin);
  const cleanUsername = (username ?? '').trim().toLowerCase() || 'owner';

  if (cleanUsername === 'owner') {
    const db = getDb();
    const row = db
      .prepare('SELECT pin_hash, failed_attempts, locked_until FROM owner_security WHERE id = 1')
      .get() as
      | { pin_hash: string; failed_attempts: number; locked_until: string | null }
      | undefined;
    if (!row) {
      throw new BusinessError('PIN_NOT_CONFIGURED', 'Veuillez définir le PIN propriétaire initial.', 400);
    }
    const preLockMs = parseTimestampMs(row.locked_until);
    if (preLockMs > Date.now()) {
      const secs = Math.max(1, Math.ceil((preLockMs - Date.now()) / 1000));
      throw new BusinessError(
        'PIN_LOCKED',
        `Trop de tentatives incorrectes. Réessayez dans ${secs} seconde(s).`,
        429
      );
    }

    const valid = await bcrypt.compare(pin, row.pin_hash);

    let failureErr: BusinessError | null = null;
    await withWriteTx((tx) => {
      const current = tx
        .prepare('SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1')
        .get() as { failed_attempts: number; locked_until: string | null };
      const txLockMs = parseTimestampMs(current.locked_until);
      if (txLockMs > Date.now()) {
        const secs = Math.max(1, Math.ceil((txLockMs - Date.now()) / 1000));
        failureErr = new BusinessError(
          'PIN_LOCKED',
          `Trop de tentatives incorrectes. Réessayez dans ${secs} seconde(s).`,
          429
        );
        return;
      }
      if (!valid) {
        const attempts = current.failed_attempts + 1;
        const lockedUntil =
          attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null;
        tx.prepare(
          "UPDATE owner_security SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = 1"
        ).run(attempts, lockedUntil);
        auditLog(tx, 'PIN_FAILED', 'owner_security', 1, `Tentative PIN échouée (#${attempts})`);
        failureErr = new BusinessError('UNAUTHORIZED', 'Code PIN incorrect.', 401);
        return;
      }

      tx.prepare(
        "UPDATE owner_security SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1"
      ).run();
      tx.prepare(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'"
      ).run();
      auditLog(tx, 'PIN_LOGIN', 'owner_security', 1, 'Connexion propriétaire réussie');
    });
    if (failureErr) {
      throw failureErr;
    }

    const user = buildSessionIdentity('owner', 'owner', 'Propriétaire', 'owner');
    const { token } = issueToken(user);
    return { token, user };
  }

  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, username, display_name, role, pin_hash, active, failed_attempts, locked_until FROM users WHERE username = ?'
    )
    .get(cleanUsername) as
    | {
        id: number;
        username: string;
        display_name: string;
        role: string;
        pin_hash: string;
        active: number;
        failed_attempts: number;
        locked_until: string | null;
      }
    | undefined;

  if (!row) {
    throw new BusinessError('UNAUTHORIZED', 'Identifiant ou code PIN incorrect.', 401);
  }
  if (row.active !== 1) {
    throw new BusinessError('UNAUTHORIZED', 'Compte utilisateur désactivé.', 401);
  }
  const preLockMs = parseTimestampMs(row.locked_until);
  if (preLockMs > Date.now()) {
    const secs = Math.max(1, Math.ceil((preLockMs - Date.now()) / 1000));
    throw new BusinessError(
      'PIN_LOCKED',
      `Trop de tentatives incorrectes. Réessayez dans ${secs} seconde(s).`,
      429
    );
  }

  const valid = await bcrypt.compare(pin, row.pin_hash);

  let userFailureErr: BusinessError | null = null;
  await withWriteTx((tx) => {
    const current = tx
      .prepare('SELECT active, failed_attempts, locked_until FROM users WHERE id = ?')
      .get(row.id) as
      | { active: number; failed_attempts: number; locked_until: string | null }
      | undefined;
    if (!current || current.active !== 1) {
      userFailureErr = new BusinessError('UNAUTHORIZED', 'Compte utilisateur désactivé.', 401);
      return;
    }
    const txLockMs = parseTimestampMs(current.locked_until);
    if (txLockMs > Date.now()) {
      const secs = Math.max(1, Math.ceil((txLockMs - Date.now()) / 1000));
      userFailureErr = new BusinessError(
        'PIN_LOCKED',
        `Trop de tentatives incorrectes. Réessayez dans ${secs} seconde(s).`,
        429
      );
      return;
    }
    if (!valid) {
      const attempts = current.failed_attempts + 1;
      const lockedUntil =
        attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null;
      tx.prepare(
        "UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(attempts, lockedUntil, row.id);
      auditLog(
        tx,
        'USER_PIN_FAILED',
        'users',
        row.id,
        `Tentative échouée pour ${row.username} (#${attempts})`
      );
      userFailureErr = new BusinessError('UNAUTHORIZED', 'Identifiant ou code PIN incorrect.', 401);
      return;
    }

    tx.prepare(
      "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(row.id);
    tx.prepare(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details, actor_user_id, actor_name, actor_role)
       VALUES ('USER_LOGIN', 'users', ?, ?, ?, ?, ?)`
    ).run(
      String(row.id),
      `Connexion utilisateur ${row.username} (${row.role})`,
      String(row.id),
      row.display_name,
      row.role
    );
  });
  if (userFailureErr) {
    throw userFailureErr;
  }

  if (!isValidRole(row.role)) {
    throw new BusinessError('INTERNAL_ERROR', 'Rôle utilisateur invalide en base.', 500);
  }
  const user = buildSessionIdentity(String(row.id), row.username, row.display_name, row.role);
  const { token } = issueToken(user);
  return { token, user };
}

export async function changeOwnerPin(
  currentPin: string,
  newPin: string,
  keepToken?: string
): Promise<void> {
  requireCurrentActorPermission('security:change_owner_pin');
  validatePinFormat(currentPin);
  validatePinFormat(newPin);
  const db = getDb();
  const row = db.prepare('SELECT pin_hash FROM owner_security WHERE id = 1').get() as
    | { pin_hash: string }
    | undefined;
  if (!row) {
    throw new BusinessError('PIN_NOT_CONFIGURED', 'Aucun PIN configuré.');
  }
  const ok = await bcrypt.compare(currentPin, row.pin_hash);
  if (!ok) {
    throw new BusinessError('UNAUTHORIZED', 'Code PIN actuel incorrect.', 401);
  }
  const newHash = await bcrypt.hash(newPin, 10);
  await withWriteTx((tx) => {
    tx.prepare(
      "UPDATE owner_security SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1"
    ).run(newHash);
    tx.prepare(
      "UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'"
    ).run(newHash);
    auditLog(tx, 'PIN_CHANGED', 'owner_security', 1, 'Modification du code PIN propriétaire');
  });
  for (const tok of [...activeSessions.keys()]) {
    if (!keepToken || tok !== keepToken) {
      activeSessions.delete(tok);
    }
  }
}

export function listUsers(): UserSummary[] {
  requireCurrentActorPermission('security:manage_users');
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, username, display_name, role, active, failed_attempts, locked_until, created_at
       FROM users
       ORDER BY id ASC`
    )
    .all() as Array<{
    id: number;
    username: string;
    display_name: string;
    role: string;
    active: number;
    failed_attempts: number;
    locked_until: string | null;
    created_at: string;
  }>;

  return rows.map((r) => {
    const role: Role = isValidRole(r.role) ? r.role : 'cashier';
    const lockMs = parseTimestampMs(r.locked_until);
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role,
      roleLabel: ROLE_LABELS_FR[role],
      active: r.active === 1,
      failedAttempts: r.failed_attempts,
      lockedUntil: lockMs > Date.now() ? r.locked_until : null,
      createdAt: r.created_at,
    };
  });
}

export async function createUser(input: {
  username: string;
  displayName: string;
  role: string;
  pin: string;
}): Promise<UserSummary> {
  requireCurrentActorPermission('security:manage_users');
  const username = validateUsername(input.username);
  const displayName = (input.displayName ?? '').trim();
  if (!displayName) {
    throw new BusinessError('VALIDATION_ERROR', "Le nom complet de l'utilisateur est obligatoire.");
  }
  if (!isValidRole(input.role)) {
    throw new BusinessError('VALIDATION_ERROR', 'Rôle utilisateur invalide.');
  }
  if (input.role === 'owner') {
    throw new BusinessError('VALIDATION_ERROR', 'Le rôle Propriétaire est unique.');
  }
  validatePinFormat(input.pin);
  const validatedRole: Role = input.role;
  const hash = await bcrypt.hash(input.pin, 10);

  let createdId = 0;
  await withWriteTx((tx) => {
    const dup = tx.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (dup) {
      throw new BusinessError('DUPLICATE_OPERATION', 'Cet identifiant utilisateur existe déjà.', 409);
    }
    const info = tx
      .prepare(
        'INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts) VALUES (?, ?, ?, ?, 1, 0)'
      )
      .run(username, displayName, validatedRole, hash);
    createdId = Number(info.lastInsertRowid);
    auditLog(
      tx,
      'CREATE_USER',
      'users',
      createdId,
      `Création utilisateur ${username} (${ROLE_LABELS_FR[validatedRole]})`
    );
  });

  const user = listUsers().find((u) => u.id === createdId);
  if (!user) {
    throw new BusinessError('INTERNAL_ERROR', 'Utilisateur créé introuvable.', 500);
  }
  return user;
}

export async function setUserActive(userId: number, active: boolean): Promise<UserSummary> {
  requireCurrentActorPermission('security:manage_users');
  await withWriteTx((tx) => {
    const row = tx
      .prepare('SELECT username, role FROM users WHERE id = ?')
      .get(userId) as { username: string; role: string } | undefined;
    if (!row) {
      throw new BusinessError('VALIDATION_ERROR', 'Utilisateur introuvable.');
    }
    if (row.role === 'owner' || row.username === 'owner') {
      throw new BusinessError('VALIDATION_ERROR', 'Impossible de désactiver le compte Propriétaire.');
    }
    tx.prepare("UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ?").run(
      active ? 1 : 0,
      userId
    );
    auditLog(
      tx,
      active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      'users',
      userId,
      `${active ? 'Activation' : 'Désactivation'} du compte ${row.username}`
    );
  });

  if (!active) {
    for (const [tok, rec] of activeSessions.entries()) {
      if (rec.identity.userId === String(userId)) {
        activeSessions.delete(tok);
      }
    }
  }

  const updated = listUsers().find((u) => u.id === userId);
  if (!updated) {
    throw new BusinessError('VALIDATION_ERROR', 'Utilisateur introuvable.');
  }
  return updated;
}

export function purgeExpiredSessions(now = Date.now()): number {
  let removed = 0;
  for (const [tok, rec] of activeSessions.entries()) {
    const expiredMax = now >= rec.expiresAt;
    const expiredIdle = now - rec.lastActivityAt > sessionIdleTimeoutMs;
    if (rec.revoked || expiredMax || expiredIdle) {
      activeSessions.delete(tok);
      removed += 1;
    }
  }
  return removed;
}

function issueToken(
  identity: SessionIdentity,
  now = Date.now()
): { token: string; record: SessionRecord } {
  purgeExpiredSessions(now);
  const token = crypto.randomBytes(32).toString('hex');
  const record: SessionRecord = {
    token,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + sessionMaxLifetimeMs,
    identity,
    revoked: false,
  };
  activeSessions.set(token, record);
  return { token, record };
}

export function verifyTokenAndTouch(token: string | undefined, now = Date.now()): SessionIdentity | null {
  if (!token) return null;
  const trimmed = token.trim();
  const session = activeSessions.get(trimmed);
  if (!session) return null;
  if (session.revoked || now >= session.expiresAt || now - session.lastActivityAt > sessionIdleTimeoutMs) {
    activeSessions.delete(trimmed);
    return null;
  }
  session.lastActivityAt = now;
  purgeExpiredSessions(now);
  return session.identity;
}

export function verifyToken(token: string | undefined): boolean {
  return verifyTokenAndTouch(token) !== null;
}

export function getSessionIdentity(token: string | undefined): SessionIdentity | null {
  return verifyTokenAndTouch(token);
}

export function revokeToken(token: string | undefined): void {
  if (!token) return;
  const trimmed = token.trim();
  const rec = activeSessions.get(trimmed);
  if (rec) {
    rec.revoked = true;
    activeSessions.delete(trimmed);
  }
}

export function activeSessionCount(): number {
  return activeSessions.size;
}
