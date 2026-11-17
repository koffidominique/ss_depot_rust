import {
  getDb,
  withWriteTx,
  nextSequence,
  requireOpenSession,
  getTheoreticalCash,
  auditLog,
} from '../db.ts';
import {
  BusinessError,
  checkedAddMilli,
  checkedAddMoney,
  checkedSubMoney,
  checkedSubNonNegativeMoney,
  formatMilli,
  nonNegativeFcfa,
  nonNegativeMilli,
  positiveFcfa,
  positiveMilli,
} from '../domain.ts';
import { sanitizeImagePath } from './catalog.ts';

export function getCashStatus() {
  const db = getDb();
  const activeSession = db
    .prepare("SELECT * FROM cash_sessions WHERE status = 'open' LIMIT 1")
    .get() as { id: number; reference: string; opened_at: string; opening_cash: number } | undefined;

  let summary = null;
  if (activeSession) {
    const theoreticalCash = getTheoreticalCash(db, activeSession.id, activeSession.opening_cash);
    const byMethod = db
      .prepare(
        `SELECT cm.method_code, pm.label, pm.is_cash,
                COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0) AS total_out
         FROM cash_movements cm
         JOIN payment_methods pm ON pm.code = cm.method_code
         WHERE cm.session_id = ?
         GROUP BY cm.method_code, pm.label, pm.is_cash`
      )
      .all(activeSession.id);
    const movements = db
      .prepare(
        `SELECT cm.*, pm.label AS method_label, pm.is_cash
         FROM cash_movements cm
         JOIN payment_methods pm ON pm.code = cm.method_code
         WHERE cm.session_id = ?
         ORDER BY cm.id DESC LIMIT 100`
      )
      .all(activeSession.id);
    summary = { theoreticalCash, byMethod, movements };
  }

  const history = db
    .prepare("SELECT * FROM cash_sessions WHERE status = 'closed' ORDER BY id DESC LIMIT 30")
    .all();

  return { activeSession: activeSession || null, summary, history };
}

export async function openCashSession(input: { opening_cash: number; request_key: string }) {
  const openingCash = nonNegativeFcfa(input.opening_cash, 'Fond de caisse initial');
  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM cash_sessions WHERE opening_key = ?').get(input.request_key);
    if (dup) return dup;
    const open = db.prepare("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1").get();
    if (open) {
      throw new BusinessError('SESSION_ALREADY_OPEN', 'Une session de caisse est déjà ouverte.');
    }
    const ref = nextSequence(db, 'CAI');
    const id = Number(
      db
        .prepare(
          "INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES (?, ?, 'open', ?)"
        )
        .run(ref, input.request_key, openingCash).lastInsertRowid
    );
    auditLog(db, 'OPEN_CASH', 'cash_sessions', id, `Ouverture ${ref} — Fond ${openingCash} FCFA`);
    return db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id);
  });
}

export async function closeCashSession(input: {
  session_id: number;
  physical_cash: number;
  closing_notes?: string;
  request_key: string;
}) {
  const physicalCash = nonNegativeFcfa(input.physical_cash, 'Montant physique compté');
  const notes = (input.closing_notes || '').trim();

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM cash_sessions WHERE closing_key = ?').get(input.request_key);
    if (dup) return dup;

    const session = db
      .prepare("SELECT * FROM cash_sessions WHERE id = ? AND status = 'open'")
      .get(input.session_id) as { id: number; reference: string; opening_cash: number } | undefined;
    if (!session) throw new BusinessError('SESSION_NOT_OPEN', 'Session ouverte introuvable.');

    const theoretical = getTheoreticalCash(db, session.id, session.opening_cash);
    const difference = checkedSubMoney(physicalCash, theoretical, 'Écart de clôture');
    if (difference !== 0 && !notes) {
      throw new BusinessError(
        'VALIDATION_ERROR',
        `Un écart de caisse (${difference} FCFA) nécessite obligatoirement un commentaire justificatif.`
      );
    }

    db.prepare(
      `UPDATE cash_sessions
       SET status = 'closed', closing_key = ?, closed_at = datetime('now'),
           theoretical_cash = ?, physical_cash = ?, difference = ?, closing_notes = ?
       WHERE id = ?`
    ).run(input.request_key, theoretical, physicalCash, difference, notes || null, session.id);

    auditLog(
      db,
      'CLOSE_CASH',
      'cash_sessions',
      session.id,
      `Clôture ${session.reference} — Théorique ${theoretical} FCFA / Physique ${physicalCash} FCFA / Écart ${difference} FCFA`
    );
    return db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(session.id);
  });
}

export function listReceivables() {
  const db = getDb();
  return db
    .prepare(
      `SELECT cr.*, s.reference AS sale_reference, s.created_at AS sale_date, s.total_amount AS sale_total,
              c.name AS client_name, c.code AS client_code, c.phone AS client_phone
       FROM customer_receivables cr
       JOIN sales s ON s.id = cr.sale_id
       JOIN clients c ON c.id = cr.client_id
       ORDER BY CASE WHEN cr.status IN ('open', 'partial') THEN 0 ELSE 1 END, cr.due_date ASC, cr.id DESC`
    )
    .all();
}

export async function payReceivable(
  receivableId: number,
  input: {
    request_key: string;
    note?: string;
    parts: Array<{ method_code: string; amount: number }>;
  }
) {
  if (!input.parts?.length) {
    throw new BusinessError('INVALID_PAYMENT', 'Indiquez au moins un moyen de paiement.');
  }
  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM payments WHERE request_key = ?').get(input.request_key);
    if (dup) return db.prepare('SELECT * FROM customer_receivables WHERE id = ?').get(receivableId);

    const session = requireOpenSession(db);
    const rec = db.prepare('SELECT * FROM customer_receivables WHERE id = ?').get(receivableId) as
      | { id: number; sale_id: number; client_id: number; remaining_amount: number; status: string }
      | undefined;
    if (!rec) throw new BusinessError('VALIDATION_ERROR', 'Créance introuvable.', 404);
    if (rec.status === 'cancelled' || rec.remaining_amount <= 0) {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Cette créance est déjà soldée ou annulée.');
    }

    let totalPaid = 0;
    const validParts: Array<{ methodCode: string; amount: number }> = [];
    for (const part of input.parts) {
      const amt = positiveFcfa(part.amount, `Montant (${part.method_code})`);
      const pm = db.prepare('SELECT code, active FROM payment_methods WHERE code = ?').get(part.method_code) as
        | { code: string; active: number }
        | undefined;
      if (!pm || !pm.active) throw new BusinessError('INVALID_PAYMENT', 'Moyen de paiement invalide ou inactif.');
      totalPaid = checkedAddMoney(totalPaid, amt, 'Total règlement');
      validParts.push({ methodCode: pm.code, amount: amt });
    }

    if (totalPaid > rec.remaining_amount) {
      throw new BusinessError(
        'INVALID_PAYMENT',
        `Le paiement (${totalPaid} FCFA) dépasse le solde restant (${rec.remaining_amount} FCFA).`
      );
    }

    const payRef = nextSequence(db, 'REC');
    const paymentId = Number(
      db
        .prepare(
          `INSERT INTO payments (reference, request_key, sale_id, client_id, payment_kind, total_amount, note)
           VALUES (?, ?, ?, ?, 'receivable', ?, ?)`
        )
        .run(payRef, input.request_key, rec.sale_id, rec.client_id, totalPaid, input.note?.trim() || null)
        .lastInsertRowid
    );

    db.prepare('INSERT INTO payment_allocations (payment_id, receivable_id, amount) VALUES (?, ?, ?)').run(
      paymentId,
      rec.id,
      totalPaid
    );

    validParts.forEach((p, idx) => {
      const partId = Number(
        db
          .prepare('INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)')
          .run(paymentId, p.methodCode, p.amount).lastInsertRowid
      );
      db.prepare(
        `INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, ?, 'receivable', ?, 'in', ?, ?, ?)`
      ).run(
        session.id,
        `cm-rec:${input.request_key}:${idx}`,
        partId,
        p.methodCode,
        p.amount,
        `Encaissement créance #${rec.id}`,
        payRef
      );
    });

    const nextRem = checkedSubNonNegativeMoney(
      rec.remaining_amount,
      totalPaid,
      'Solde restant créance'
    );
    db.prepare('UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?').run(
      nextRem,
      nextRem === 0 ? 'paid' : 'partial',
      rec.id
    );
    db.prepare('UPDATE sales SET paid_amount = paid_amount + ? WHERE id = ?').run(totalPaid, rec.sale_id);

    auditLog(db, 'PAY_RECEIVABLE', 'customer_receivables', rec.id, `${payRef} — ${totalPaid} FCFA`);
    return db.prepare('SELECT * FROM customer_receivables WHERE id = ?').get(rec.id);
  });
}

export function listExpenses() {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
  const items = db
    .prepare(
      `SELECT e.*, pm.label AS method_label
       FROM expenses e
       JOIN payment_methods pm ON pm.code = e.method_code
       ORDER BY e.id DESC LIMIT 500`
    )
    .all();
  return { categories, items };
}

export async function createExpense(input: {
  request_key: string;
  category: string;
  amount: number;
  method_code: string;
  beneficiary?: string;
  notes?: string;
  receipt_path?: string | null;
  expense_date?: string;
}) {
  const category = (input.category || '').trim();
  if (!category) throw new BusinessError('VALIDATION_ERROR', 'La catégorie est obligatoire.');
  const amount = positiveFcfa(input.amount, 'Montant dépense');
  const receiptPath = sanitizeImagePath(input.receipt_path);

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM expenses WHERE request_key = ?').get(input.request_key);
    if (dup) return dup;

    const session = requireOpenSession(db);
    const pm = db.prepare('SELECT code, is_cash, active FROM payment_methods WHERE code = ?').get(input.method_code) as
      | { code: string; is_cash: number; active: number }
      | undefined;
    if (!pm || !pm.active) throw new BusinessError('INVALID_PAYMENT', 'Moyen de paiement invalide.');

    if (pm.is_cash === 1) {
      const avail = getTheoreticalCash(db, session.id, session.opening_cash);
      if (amount > avail) {
        throw new BusinessError('INVALID_PAYMENT', 'Espèces insuffisantes en caisse pour cette dépense.');
      }
    }

    const ref = nextSequence(db, 'DEP');
    const expId = Number(
      db
        .prepare(
          `INSERT INTO expenses (reference, request_key, category, amount, method_code, session_id, beneficiary, notes, receipt_path, expense_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ref,
          input.request_key,
          category,
          amount,
          pm.code,
          session.id,
          input.beneficiary?.trim() || null,
          input.notes?.trim() || null,
          receiptPath,
          input.expense_date || new Date().toISOString()
        ).lastInsertRowid
    );

    db.prepare(
      `INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
       VALUES (?, ?, 'expense', ?, 'out', ?, ?, ?)`
    ).run(session.id, `cm-exp:${input.request_key}`, pm.code, amount, `Dépense ${category} (${ref})`, ref);

    auditLog(db, 'CREATE_EXPENSE', 'expenses', expId, `${ref} — ${category} : ${amount} FCFA`);
    return db.prepare('SELECT * FROM expenses WHERE id = ?').get(expId);
  });
}

export function getStockOverview() {
  const db = getDb();
  const products = db
    .prepare(
      `SELECT p.id, p.reference, p.name, p.brand, c.name AS category_name, p.base_unit,
              p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den, p.is_active
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1
       ORDER BY p.name ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = products.map((p) => {
    const hasKnownCost = Boolean(
      p.average_cost_num && p.average_cost_den && BigInt(String(p.average_cost_den)) > 0n
    );
    let avgCost: number | null = null;
    let valuation: number | null = null;
    if (hasKnownCost) {
      const num = BigInt(String(p.average_cost_num));
      const den = BigInt(String(p.average_cost_den));
      const avgBig = (num + den / 2n) / den;
      const valBig = (BigInt(Number(p.stock_milli)) * avgBig + 500n) / 1000n;
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      avgCost = avgBig <= maxSafe && avgBig >= -maxSafe ? Number(avgBig) : null;
      valuation =
        avgCost !== null && valBig <= maxSafe && valBig >= -maxSafe ? Number(valBig) : null;
    }
    return {
      ...p,
      average_cost_fcfa: avgCost,
      valuation_fcfa: valuation,
    };
  });

  const movements = db
    .prepare(
      `SELECT sm.*, p.name AS product_name, p.reference AS product_reference, p.base_unit
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       ORDER BY sm.id DESC LIMIT 500`
    )
    .all();

  return { products: enriched, movements };
}

export async function adjustStock(input: {
  product_id: number;
  direction: 'in' | 'out';
  quantity: string | number;
  reason: string;
  request_key: string;
}) {
  const productId = Number(input.product_id);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new BusinessError('PRODUCT_NOT_FOUND', 'Produit invalide.', 400);
  }
  if (input.direction !== 'in' && input.direction !== 'out') {
    throw new BusinessError('VALIDATION_ERROR', "Le sens d'ajustement doit être 'in' ou 'out'.");
  }
  const qtyMilli = positiveMilli(input.quantity, 'Quantité ajustée');
  const reason = (input.reason || '').trim();
  if (reason.length < 3) {
    throw new BusinessError(
      'VALIDATION_ERROR',
      'Un motif explicite (au moins 3 caractères) est obligatoire pour ajuster le stock.'
    );
  }
  const requestKey = (input.request_key || '').trim();
  if (!requestKey) {
    throw new BusinessError('VALIDATION_ERROR', "La clé d'idempotence (request_key) est obligatoire.");
  }

  return withWriteTx((db) => {
    const existingLog = db
      .prepare(
        "SELECT details FROM audit_logs WHERE action = 'MANUAL_STOCK_ADJUST_KEY' AND entity_id = ?"
      )
      .get(requestKey) as { details: string } | undefined;
    if (existingLog) {
      const existingMove = db
        .prepare(
          `SELECT sm.*, p.name AS product_name, p.reference AS product_reference, p.base_unit
           FROM stock_movements sm
           JOIN products p ON p.id = sm.product_id
           WHERE sm.id = ?`
        )
        .get(Number(existingLog.details));
      if (existingMove) return existingMove;
    }

    const prod = db
      .prepare(
        'SELECT id, name, reference, base_unit, stock_milli, average_cost_num, average_cost_den, is_active FROM products WHERE id = ?'
      )
      .get(productId) as
      | {
          id: number;
          name: string;
          reference: string;
          base_unit: string;
          stock_milli: number;
          average_cost_num: string | null;
          average_cost_den: string | null;
          is_active: number;
        }
      | undefined;

    if (!prod) {
      throw new BusinessError('PRODUCT_NOT_FOUND', 'Produit introuvable.', 404);
    }
    if (!prod.is_active) {
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Impossible d’ajuster manuellement le stock d’un produit archivé.'
      );
    }

    const delta = input.direction === 'out' ? -qtyMilli : qtyMilli;
    const stockAfter = checkedAddMilli(prod.stock_milli, delta, 'Stock après ajustement');
    const settings = db
      .prepare('SELECT allow_negative_stock FROM app_settings WHERE id = 1')
      .get() as { allow_negative_stock: number } | undefined;
    if (stockAfter < 0 && (!settings || !settings.allow_negative_stock)) {
      throw new BusinessError(
        'INSUFFICIENT_STOCK',
        `Stock insuffisant sur "${prod.name}" (disponible : ${formatMilli(prod.stock_milli)} ${prod.base_unit}).`
      );
    }

    const unitCost =
      prod.average_cost_num && prod.average_cost_den && BigInt(prod.average_cost_den) > 0n
        ? Number((BigInt(prod.average_cost_num) + BigInt(prod.average_cost_den) / 2n) / BigInt(prod.average_cost_den))
        : null;

    const adjRef = nextSequence(db, 'ADJ');
    db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(stockAfter, productId);

    const moveRes = db
      .prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
         VALUES (?, 'manual_adjust', ?, ?, ?, ?, ?, ?)`
      )
      .run(productId, delta, prod.stock_milli, stockAfter, unitCost, reason, adjRef);
    const movementId = Number(moveRes.lastInsertRowid);

    auditLog(
      db,
      'MANUAL_STOCK_ADJUST',
      'products',
      productId,
      `${adjRef} · ${prod.name} (${delta > 0 ? '+' : ''}${formatMilli(delta)} ${prod.base_unit}) : ${reason}`
    );
    auditLog(db, 'MANUAL_STOCK_ADJUST_KEY', 'request_key', requestKey, String(movementId));

    return db
      .prepare(
        `SELECT sm.*, p.name AS product_name, p.reference AS product_reference, p.base_unit
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         WHERE sm.id = ?`
      )
      .get(movementId);
  });
}

export function listInventories() {
  const db = getDb();
  const invs = db.prepare('SELECT * FROM inventories ORDER BY id DESC').all() as Array<
    Record<string, unknown> & { id: number }
  >;
  const lineStmt = db.prepare(
    `SELECT il.*, p.name AS product_name, p.reference AS product_reference, p.base_unit
     FROM inventory_lines il
     JOIN products p ON p.id = il.product_id
     WHERE il.inventory_id = ?
     ORDER BY p.name ASC`
  );
  return invs.map((inv) => ({ ...inv, lines: lineStmt.all(Number(inv.id)) }));
}

export async function createInventory(notes?: string) {
  return withWriteTx((db) => {
    const ref = nextSequence(db, 'INV');
    const invId = Number(
      db.prepare("INSERT INTO inventories (reference, status, notes) VALUES (?, 'draft', ?)").run(
        ref,
        notes?.trim() || null
      ).lastInsertRowid
    );
    const prods = db.prepare('SELECT id, stock_milli FROM products WHERE is_active = 1').all() as Array<{
      id: number;
      stock_milli: number;
    }>;
    const stmt = db.prepare(
      'INSERT INTO inventory_lines (inventory_id, product_id, theoretical_milli) VALUES (?, ?, ?)'
    );
    for (const p of prods) {
      stmt.run(invId, p.id, p.stock_milli);
    }
    auditLog(db, 'CREATE_INVENTORY', 'inventories', invId, `Création inventaire ${ref}`);
    return listInventories().find((i) => i.id === invId);
  });
}

export async function validateInventory(
  inventoryId: number,
  lines: Array<{ product_id: number; counted_quantity: string | number; reason?: string }>
) {
  return withWriteTx((db) => {
    const inv = db.prepare('SELECT * FROM inventories WHERE id = ?').get(inventoryId) as
      | { id: number; reference: string; status: string }
      | undefined;
    if (!inv) throw new BusinessError('VALIDATION_ERROR', 'Inventaire introuvable.', 404);
    if (inv.status !== 'draft') {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Cet inventaire a déjà été validé ou annulé.');
    }

    for (const l of lines) {
      const countedMilli = nonNegativeMilli(l.counted_quantity, 'Quantité comptée');
      const existingLine = db
        .prepare('SELECT * FROM inventory_lines WHERE inventory_id = ? AND product_id = ?')
        .get(inventoryId, l.product_id) as { id: number; theoretical_milli: number } | undefined;
      if (!existingLine) continue;

      const prod = db.prepare('SELECT stock_milli, name FROM products WHERE id = ?').get(l.product_id) as {
        stock_milli: number;
        name: string;
      };
      const delta = countedMilli - prod.stock_milli;
      const reason = l.reason?.trim() || '';
      if (delta !== 0 && !reason) {
        throw new BusinessError(
          'VALIDATION_ERROR',
          `Un motif est obligatoire pour l'écart d'inventaire sur "${prod.name}".`
        );
      }

      db.prepare('UPDATE inventory_lines SET counted_milli = ?, reason = ? WHERE id = ?').run(
        countedMilli,
        reason || null,
        existingLine.id
      );

      if (delta !== 0) {
        db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(countedMilli, l.product_id);
        db.prepare(
          `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
           VALUES (?, 'inventory_adjust', ?, ?, ?, ?, ?)`
        ).run(
          l.product_id,
          delta,
          prod.stock_milli,
          countedMilli,
          `Inventaire ${inv.reference} : ${reason}`,
          inv.reference
        );
      }
    }

    db.prepare("UPDATE inventories SET status = 'validated', validated_at = datetime('now') WHERE id = ?").run(
      inventoryId
    );
    auditLog(db, 'VALIDATE_INVENTORY', 'inventories', inventoryId, `Validation inventaire ${inv.reference}`);
    return listInventories().find((i) => i.id === inventoryId);
  });
}
