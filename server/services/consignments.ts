import { getDb, withWriteTx, nextSequence, requireOpenSession, getTheoreticalCash, auditLog } from '../db.ts';
import { requireCurrentActorPermission } from './auth.ts';
import {
  BusinessError,
  checkedAddMoney,
  checkedMulMoney,
  checkedSubMoney,
  checkedSubNonNegativeMoney,
  nonNegativeFcfa,
} from '../domain.ts';

export function getConsignmentsOverview() {
  requireCurrentActorPermission('consignments:read');
  const db = getDb();
  const types = db
    .prepare(
      `SELECT rpt.*, COALESCE(rsb.quantity, 0) AS stock_quantity
       FROM returnable_packaging_types rpt
       LEFT JOIN returnable_stock_balances rsb ON rsb.packaging_id = rpt.id
       ORDER BY rpt.name`
    )
    .all();

  const clientBalances = db
    .prepare(
      `SELECT cpa.rowid AS id, cpa.*, c.name AS client_name, c.code AS client_code, rpt.name AS packaging_name, rpt.code AS packaging_code, rpt.deposit_value
       FROM customer_packaging_accounts cpa
       JOIN clients c ON c.id = cpa.client_id
       JOIN returnable_packaging_types rpt ON rpt.id = cpa.returnable_id
       WHERE cpa.balance_pieces > 0 OR cpa.deposit_held_amount > 0
       ORDER BY c.name, rpt.name`
    )
    .all();

  const recentMovements = db
    .prepare(
      `SELECT rsm.*, rsm.date AS created_at, rpt.name AS packaging_name, rpt.code AS packaging_code
       FROM returnable_stock_movements rsm
       JOIN returnable_packaging_types rpt ON rpt.id = rsm.packaging_id
       ORDER BY rsm.id DESC LIMIT 50`
    )
    .all();

  const openIssues = db
    .prepare(
      `SELECT di.*, s.reference AS sale_reference, c.name AS client_name, rpt.name AS packaging_name, rpt.code AS packaging_code
       FROM deposit_issues di
       JOIN sales s ON s.id = di.sale_id
       LEFT JOIN clients c ON c.id = di.client_id
       JOIN returnable_packaging_types rpt ON rpt.id = di.returnable_id
       WHERE s.status != 'cancelled' AND di.returned_pieces < di.pieces
       ORDER BY di.id DESC`
    )
    .all();

  const returns = db
    .prepare(
      `SELECT dr.*, rpt.name AS packaging_name, c.name AS client_name, pm.label AS method_label
       FROM deposit_returns dr
       JOIN returnable_packaging_types rpt ON rpt.id = dr.returnable_id
       LEFT JOIN clients c ON c.id = dr.client_id
       JOIN payment_methods pm ON pm.code = dr.method_code
       ORDER BY dr.id DESC LIMIT 50`
    )
    .all();

  return { types, clientBalances, recentMovements, openIssues, returns };
}

export async function createReturnableType(input: {
  code: string;
  name: string;
  producer: string;
  kind: 'bottle' | 'crate';
  deposit_value: number;
  initial_stock?: number;
  description?: string;
}) {
  requireCurrentActorPermission('consignments:write');
  const code = (input.code || '').trim().toUpperCase();
  const name = (input.name || '').trim();
  const producer = (input.producer || '').trim();
  if (!code || !name || !producer) {
    throw new BusinessError('VALIDATION_ERROR', 'Code, nom et producteur sont obligatoires.');
  }
  const depositValue = nonNegativeFcfa(input.deposit_value, 'Valeur de consigne');
  const initialStock = Number(input.initial_stock ?? 0);
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Le stock initial doit être un entier positif ou nul.');
  }

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT id FROM returnable_packaging_types WHERE code = ?').get(code);
    if (dup) throw new BusinessError('DUPLICATE_OPERATION', 'Code emballage déjà utilisé.');

    const id = Number(
      db
        .prepare(
          'INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(code, name, producer, input.kind, input.description?.trim() || null, depositValue).lastInsertRowid
    );

    db.prepare('INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)').run(
      id,
      initialStock
    );
    if (initialStock > 0) {
      db.prepare(
        `INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
         VALUES (?, ?, 'initial', ?, 0, ?, 'Stock initial emballage', ?)`
      ).run(`init-ret-${id}-${Date.now()}`, id, initialStock, initialStock, code);
    }
    auditLog(db, 'CREATE_RETURNABLE_TYPE', 'returnable_packaging_types', id, `${code} — ${name}`);
    return db.prepare('SELECT * FROM returnable_packaging_types WHERE id = ?').get(id);
  });
}

export async function adjustReturnableStock(input: {
  packaging_id: number;
  movement_type: 'entry' | 'exit' | 'breakage' | 'loss' | 'correction_in' | 'correction_out';
  quantity: number;
  reason: string;
  request_key: string;
}) {
  requireCurrentActorPermission('consignments:write');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new BusinessError('VALIDATION_ERROR', 'La quantité doit être un entier strictement positif.');
  }
  const reason = (input.reason || '').trim();
  if (!reason) throw new BusinessError('VALIDATION_ERROR', 'Le motif est obligatoire.');

  return withWriteTx((db) => {
    const dup = db
      .prepare('SELECT * FROM returnable_stock_movements WHERE request_key = ?')
      .get(input.request_key);
    if (dup) return dup;

    const bal = db
      .prepare('SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?')
      .get(input.packaging_id) as { quantity: number } | undefined;
    const before = bal ? bal.quantity : 0;
    const isOut = ['exit', 'breakage', 'loss', 'correction_out'].includes(input.movement_type);
    const after = isOut
      ? checkedSubMoney(before, input.quantity, 'Stock de vides')
      : checkedAddMoney(before, input.quantity, 'Stock de vides');
    if (after < 0) {
      throw new BusinessError('INSUFFICIENT_STOCK', 'Stock de vides insuffisant pour ce mouvement.');
    }

    if (bal) {
      db.prepare('UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?').run(
        after,
        input.packaging_id
      );
    } else {
      db.prepare('INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)').run(
        input.packaging_id,
        after
      );
    }

    const movId = Number(
      db
        .prepare(
          `INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(input.request_key, input.packaging_id, input.movement_type, input.quantity, before, after, reason)
        .lastInsertRowid
    );
    auditLog(db, 'RETURNABLE_STOCK_MOVEMENT', 'returnable_packaging_types', input.packaging_id, `${input.movement_type} ${input.quantity} (${reason})`);
    return db.prepare('SELECT * FROM returnable_stock_movements WHERE id = ?').get(movId);
  });
}

export async function returnClientEmpties(input: {
  issue_id: number;
  pieces: number;
  condition_state: 'good' | 'damaged';
  refund_amount: number;
  credit_reduction: number;
  method_code: string;
  reason: string;
  request_key: string;
}) {
  requireCurrentActorPermission('consignments:write');
  if (!Number.isInteger(input.pieces) || input.pieces <= 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Nombre de pièces retournées invalide.');
  }
  const refundAmount = nonNegativeFcfa(input.refund_amount, 'Montant remboursé');
  const creditReduction = nonNegativeFcfa(input.credit_reduction, 'Réduction créance');
  const reason = (input.reason || '').trim();
  if (!reason) throw new BusinessError('VALIDATION_ERROR', 'Le motif du retour est obligatoire.');

  return withWriteTx((db) => {
    const existing = db.prepare('SELECT * FROM deposit_returns WHERE request_key = ?').get(input.request_key);
    if (existing) return existing;

    const session = requireOpenSession(db);
    const issue = db
      .prepare('SELECT * FROM deposit_issues WHERE id = ?')
      .get(input.issue_id) as
      | {
          id: number;
          sale_id: number;
          client_id: number | null;
          returnable_id: number;
          pieces: number;
          returned_pieces: number;
          unit_value: number;
          amount: number;
        }
      | undefined;
    if (!issue) throw new BusinessError('VALIDATION_ERROR', 'Consigne client introuvable.');
    const totalReturned = checkedAddMoney(
      issue.returned_pieces,
      input.pieces,
      'Pièces retournées'
    );
    if (totalReturned > issue.pieces) {
      throw new BusinessError('VALIDATION_ERROR', 'Nombre de vides retournés supérieur au solde sorti sur cette vente.');
    }

    const maxValue = checkedMulMoney(input.pieces, issue.unit_value, 'Valeur consignée retournée');
    const totalCounterpart = checkedAddMoney(
      refundAmount,
      creditReduction,
      'Contrepartie retour vides'
    );
    if (totalCounterpart > maxValue) {
      throw new BusinessError(
        'INVALID_PAYMENT',
        `La contrepartie (${totalCounterpart} FCFA) dépasse la valeur consignée (${maxValue} FCFA).`
      );
    }

    if (creditReduction > 0) {
      const rec = db
        .prepare('SELECT id, remaining_amount FROM customer_receivables WHERE sale_id = ?')
        .get(issue.sale_id) as { id: number; remaining_amount: number } | undefined;
      if (!rec || creditReduction > rec.remaining_amount) {
        throw new BusinessError('INVALID_PAYMENT', 'Réduction de créance supérieure au solde restant de la vente.');
      }
      const nextRem = checkedSubNonNegativeMoney(
        rec.remaining_amount,
        creditReduction,
        'Solde restant créance'
      );
      db.prepare("UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?").run(
        nextRem,
        nextRem === 0 ? 'paid' : 'partial',
        rec.id
      );
    }

    if (refundAmount > 0 && input.method_code === 'cash') {
      const avail = getTheoreticalCash(db, session.id, session.opening_cash);
      if (refundAmount > avail) {
        throw new BusinessError('INVALID_PAYMENT', 'Espèces en caisse insuffisantes pour rembourser la consigne.');
      }
    }

    const bal = db
      .prepare('SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?')
      .get(issue.returnable_id) as { quantity: number } | undefined;
    const before = bal ? bal.quantity : 0;
    const after = input.condition_state === 'good' ? before + input.pieces : before;

    if (input.condition_state === 'good') {
      if (bal) {
        db.prepare('UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?').run(
          after,
          issue.returnable_id
        );
      } else {
        db.prepare('INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)').run(
          issue.returnable_id,
          after
        );
      }
    }

    const movType = input.condition_state === 'good' ? 'entry' : 'breakage';
    const movId = Number(
      db
        .prepare(
          `INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `ret-vides:${input.request_key}`,
          issue.returnable_id,
          movType,
          input.pieces,
          before,
          after,
          `Retour client (${input.condition_state}) : ${reason}`,
          `VENTE-${issue.sale_id}`
        ).lastInsertRowid
    );

    db.prepare('UPDATE deposit_issues SET returned_pieces = returned_pieces + ? WHERE id = ?').run(
      input.pieces,
      issue.id
    );

    if (issue.client_id) {
      const releasedDeposit = checkedMulMoney(
        input.pieces,
        issue.unit_value,
        'Libération consigne client'
      );
      db.prepare(
        `UPDATE customer_packaging_accounts
         SET balance_pieces = MAX(0, balance_pieces - ?),
             deposit_held_amount = MAX(0, deposit_held_amount - ?)
         WHERE client_id = ? AND returnable_id = ?`
      ).run(input.pieces, releasedDeposit, issue.client_id, issue.returnable_id);
    }

    const ref = nextSequence(db, 'REC');
    if (refundAmount > 0) {
      db.prepare(
        `INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, 'deposit_refund', ?, 'out', ?, ?, ?)`
      ).run(
        session.id,
        `dep-ref:${input.request_key}`,
        input.method_code,
        refundAmount,
        `Remboursement consigne ${ref} (${reason})`,
        ref
      );
    }

    const retId = Number(
      db
        .prepare(
          `INSERT INTO deposit_returns (reference, request_key, issue_id, client_id, returnable_id, session_id, stock_movement_id, pieces, condition_state, refund_amount, credit_reduction, method_code, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ref,
          input.request_key,
          issue.id,
          issue.client_id,
          issue.returnable_id,
          session.id,
          movId,
          input.pieces,
          input.condition_state,
          refundAmount,
          creditReduction,
          input.method_code,
          reason
        ).lastInsertRowid
    );

    auditLog(db, 'DEPOSIT_RETURN', 'deposit_returns', retId, `${ref} — ${input.pieces} pièces (${input.condition_state})`);
    return db.prepare('SELECT * FROM deposit_returns WHERE id = ?').get(retId);
  });
}
