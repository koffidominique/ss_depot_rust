import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, withWriteTx, auditLog } from '../db.ts';
import { BusinessError } from '../domain.ts';

const activeTokens = new Map<string, { createdAt: number }>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function validatePinFormat(pin: string): void {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    throw new BusinessError('VALIDATION_ERROR', 'Le code PIN doit contenir exactement 6 chiffres.');
  }
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
  const lockedUntil =
    row.locked_until && new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null;
  return {
    needsSetup: false,
    lockedUntil,
    failedAttempts: row.failed_attempts,
  };
}

export async function setupOwnerPin(pin: string): Promise<{ token: string }> {
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
    auditLog(db, 'PIN_SETUP', 'owner_security', 1, 'Configuration initiale du PIN propriétaire');
  });
  return issueToken();
}

export async function loginOwner(pin: string): Promise<{ token: string }> {
  validatePinFormat(pin);
  const db = getDb();
  const row = db
    .prepare('SELECT pin_hash, failed_attempts, locked_until FROM owner_security WHERE id = 1')
    .get() as { pin_hash: string; failed_attempts: number; locked_until: string | null } | undefined;
  if (!row) {
    throw new BusinessError('PIN_NOT_CONFIGURED', 'Veuillez définir le PIN propriétaire initial.', 400);
  }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const secs = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
    throw new BusinessError(
      'PIN_LOCKED',
      `Trop de tentatives incorrectes. Réessayez dans ${secs} seconde(s).`,
      429
    );
  }

  const valid = await bcrypt.compare(pin, row.pin_hash);
  if (!valid) {
    await withWriteTx((tx) => {
      const current = tx
        .prepare('SELECT failed_attempts FROM owner_security WHERE id = 1')
        .get() as { failed_attempts: number };
      const attempts = current.failed_attempts + 1;
      const lockSeconds = attempts >= 5 ? 30 : 0;
      const lockedUntil = lockSeconds > 0 ? new Date(Date.now() + lockSeconds * 1000).toISOString() : null;
      tx.prepare(
        "UPDATE owner_security SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = 1"
      ).run(attempts, lockedUntil);
      auditLog(tx, 'PIN_FAILED', 'owner_security', 1, `Tentative PIN échouée (#${attempts})`);
    });
    throw new BusinessError('UNAUTHORIZED', 'Code PIN incorrect.', 401);
  }

  await withWriteTx((tx) => {
    tx.prepare(
      "UPDATE owner_security SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1"
    ).run();
    auditLog(tx, 'PIN_LOGIN', 'owner_security', 1, 'Connexion propriétaire réussie');
  });

  return issueToken();
}

export async function changeOwnerPin(currentPin: string, newPin: string): Promise<void> {
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
    auditLog(tx, 'PIN_CHANGED', 'owner_security', 1, 'Modification du code PIN propriétaire');
  });
}

function issueToken(): { token: string } {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { createdAt: Date.now() });
  return { token };
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const session = activeTokens.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeTokens.delete(token);
    return false;
  }
  return true;
}

export function revokeToken(token: string | undefined): void {
  if (token) {
    activeTokens.delete(token);
  }
}
