import { getDb, withWriteTx, nextSequence, requireOpenSession, getTheoreticalCash, auditLog } from '../db.ts';
import {
  BusinessError,
  checkedAddMoney,
  computeLineTotalFcfa,
  multiplyQtyCoeffToBaseMilli,
  nonNegativeFcfa,
  positiveFcfa,
  positiveMilli,
} from '../domain.ts';

export function listSuppliers(search?: string) {
  const db = getDb();
  const q = search?.trim() ? `%${search.trim()}%` : null;
  const where = q ? 'WHERE (s.name LIKE ? OR s.code LIKE ? OR s.phone LIKE ?)' : '';
  const params = q ? [q, q, q] : [];
  return db
    .prepare(
      `SELECT s.*,
              COALESCE((SELECT SUM(initial_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id), 0) AS total_purchases,
              COALESCE((SELECT SUM(remaining_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id AND sd.status IN ('open', 'partial')), 0) AS balance_due
       FROM suppliers s
       ${where}
       ORDER BY s.is_active DESC, s.name ASC`
    )
    .all(...params);
}

export async function createSupplier(input: {
  name: string;
  company_name?: string;
  phone: string;
  address?: string;
  email?: string;
  contact_person?: string;
  payment_terms_days?: number;
}) {
  const name = (input.name || '').trim();
  const phone = (input.phone || '').trim();
  if (!name || !phone) throw new BusinessError('VALIDATION_ERROR', 'Nom et téléphone fournisseur obligatoires.');
  const terms = Number(input.payment_terms_days ?? 0);
  if (!Number.isInteger(terms) || terms < 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Délai de paiement invalide.');
  }

  return withWriteTx((db) => {
    const code = nextSequence(db, 'FRN');
    const id = Number(
      db
        .prepare(
          'INSERT INTO suppliers (code, name, company_name, phone, address, email, contact_person, payment_terms_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          code,
          name,
          input.company_name?.trim() || null,
          phone,
          input.address?.trim() || null,
          input.email?.trim() || null,
          input.contact_person?.trim() || null,
          terms
        ).lastInsertRowid
    );
    auditLog(db, 'CREATE_SUPPLIER', 'suppliers', id, `${code} — ${name}`);
    return db
      .prepare(
        `SELECT s.*,
                0 AS total_purchases,
                0 AS balance_due
         FROM suppliers s WHERE s.id = ?`
      )
      .get(id);
  });
}

export async function updateSupplier(
  supplierId: number,
  input: {
    name?: string;
    company_name?: string | null;
    phone?: string;
    address?: string | null;
    email?: string | null;
    contact_person?: string | null;
    payment_terms_days?: number;
    is_active?: boolean;
  }
) {
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new BusinessError('SUPPLIER_NOT_FOUND', 'Fournisseur invalide.', 400);
  }
  return withWriteTx((db) => {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as
      | {
          id: number;
          code: string;
          name: string;
          company_name: string | null;
          phone: string;
          address: string | null;
          email: string | null;
          contact_person: string | null;
          payment_terms_days: number;
          is_active: number;
        }
      | undefined;
    if (!existing) throw new BusinessError('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable.', 404);

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const phone = input.phone !== undefined ? input.phone.trim() : existing.phone;
    if (!name || !phone) {
      throw new BusinessError('VALIDATION_ERROR', 'Nom et téléphone fournisseur obligatoires.');
    }
    const terms =
      input.payment_terms_days !== undefined ? Number(input.payment_terms_days) : existing.payment_terms_days;
    if (!Number.isInteger(terms) || terms < 0) {
      throw new BusinessError('VALIDATION_ERROR', 'Délai de paiement invalide.');
    }

    const optText = (val: string | null | undefined, prev: string | null) =>
      val === undefined ? prev : val?.trim() || null;

    const companyName = optText(input.company_name, existing.company_name);
    const address = optText(input.address, existing.address);
    const email = optText(input.email, existing.email);
    const contactPerson = optText(input.contact_person, existing.contact_person);
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active;

    db.prepare(
      `UPDATE suppliers
       SET name = ?, company_name = ?, phone = ?, address = ?, email = ?, contact_person = ?, payment_terms_days = ?, is_active = ?
       WHERE id = ?`
    ).run(name, companyName, phone, address, email, contactPerson, terms, isActive, supplierId);

    auditLog(db, 'UPDATE_SUPPLIER', 'suppliers', supplierId, `${existing.code} — ${name}`);
    return db
      .prepare(
        `SELECT s.*,
                COALESCE((SELECT SUM(initial_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id), 0) AS total_purchases,
                COALESCE((SELECT SUM(remaining_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id AND sd.status IN ('open', 'partial')), 0) AS balance_due
         FROM suppliers s WHERE s.id = ?`
      )
      .get(supplierId);
  });
}

export function listPurchaseOrders() {
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, s.code AS supplier_code
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       ORDER BY po.id DESC`
    )
    .all() as Array<Record<string, unknown> & { id: number }>;

  const lineStmt = db.prepare('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ?');
  const receiptStmt = db.prepare('SELECT * FROM purchase_receipts WHERE purchase_order_id = ? ORDER BY id DESC');
  const debtStmt = db.prepare(
    `SELECT sd.* FROM supplier_debts sd
     JOIN purchase_receipts pr ON pr.id = sd.receipt_id
     WHERE pr.purchase_order_id = ?`
  );

  return orders.map((po) => ({
    ...po,
    lines: lineStmt.all(Number(po.id)),
    receipts: receiptStmt.all(Number(po.id)),
    debts: debtStmt.all(Number(po.id)),
  }));
}

export async function createPurchaseOrder(input: {
  request_key: string;
  supplier_id: number;
  expected_date?: string | null;
  notes?: string;
  lines: Array<{
    product_id: number;
    packaging_id: number;
    quantity: string | number;
    unit_price: number;
  }>;
}) {
  if (!input.request_key?.trim()) throw new BusinessError('VALIDATION_ERROR', "Clé d'idempotence requise.");
  if (!input.lines?.length) throw new BusinessError('VALIDATION_ERROR', 'Ajoutez au moins une ligne de commande.');

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT id FROM purchase_orders WHERE request_key = ?').get(input.request_key);
    if (dup) return listPurchaseOrders().find((o) => o.id === (dup as { id: number }).id);

    const sup = db.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(input.supplier_id) as
      | { id: number; name: string }
      | undefined;
    if (!sup) throw new BusinessError('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable.', 404);

    let totalAmount = 0;
    const prepared: Array<{
      productId: number;
      packagingId: number;
      productName: string;
      packagingName: string;
      baseUnit: string;
      coeffMilli: number;
      qtyMilli: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const l of input.lines) {
      const prod = db.prepare('SELECT id, name, base_unit FROM products WHERE id = ?').get(l.product_id) as
        | { id: number; name: string; base_unit: string }
        | undefined;
      if (!prod) throw new BusinessError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
      const pkg = db
        .prepare('SELECT id, name, coefficient_milli FROM product_packagings WHERE id = ? AND product_id = ?')
        .get(l.packaging_id, l.product_id) as
        | { id: number; name: string; coefficient_milli: number }
        | undefined;
      if (!pkg) throw new BusinessError('PACKAGING_NOT_FOUND', 'Conditionnement introuvable.');

      const qtyMilli = positiveMilli(l.quantity, `Quantité commandée (${prod.name})`);
      const unitPrice = nonNegativeFcfa(l.unit_price, `Prix achat (${prod.name})`);
      const lineTotal = computeLineTotalFcfa(qtyMilli, unitPrice);
      totalAmount = checkedAddMoney(totalAmount, lineTotal, 'Total commande');
      prepared.push({
        productId: prod.id,
        packagingId: pkg.id,
        productName: prod.name,
        packagingName: pkg.name,
        baseUnit: prod.base_unit,
        coeffMilli: pkg.coefficient_milli,
        qtyMilli,
        unitPrice,
        lineTotal,
      });
    }

    const ref = nextSequence(db, 'CMD');
    const poId = Number(
      db
        .prepare(
          `INSERT INTO purchase_orders (reference, request_key, supplier_id, status, total_amount, expected_date, notes)
           VALUES (?, ?, ?, 'confirmed', ?, ?, ?)`
        )
        .run(ref, input.request_key, sup.id, totalAmount, input.expected_date || null, input.notes?.trim() || null)
        .lastInsertRowid
    );

    for (const p of prepared) {
      db.prepare(
        `INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        poId,
        p.productId,
        p.packagingId,
        p.productName,
        p.packagingName,
        p.baseUnit,
        p.coeffMilli,
        p.qtyMilli,
        p.unitPrice,
        p.lineTotal
      );
    }

    // IMPORTANT : Un bon de commande ne modifie PAS le stock avant réception.
    auditLog(db, 'CREATE_PO', 'purchase_orders', poId, `Commande ${ref} — ${totalAmount} FCFA`);
    return listPurchaseOrders().find((o) => o.id === poId);
  });
}

export async function receivePurchaseOrder(
  purchaseOrderId: number,
  input: {
    request_key: string;
    notes?: string;
    lines: Array<{
      purchase_order_line_id: number;
      received_quantity: string | number;
      discrepancy_reason?: string;
    }>;
  }
) {
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    throw new BusinessError('PURCHASE_NOT_FOUND', 'Bon de commande invalide.', 400);
  }
  const requestKey = (input.request_key || '').trim();
  if (!requestKey) throw new BusinessError('VALIDATION_ERROR', "Clé d'idempotence requise.");
  if (!input.lines?.length) throw new BusinessError('VALIDATION_ERROR', 'Saisissez au moins une ligne reçue.');

  const seenPoLines = new Set<number>();
  const normalizedLines: Array<{
    poLineId: number;
    qtyMilli: number;
    discrepancyReason: string | null;
  }> = [];
  for (const l of input.lines) {
    const poLineId = Number(l.purchase_order_line_id);
    if (!Number.isInteger(poLineId) || poLineId <= 0) {
      throw new BusinessError('VALIDATION_ERROR', 'Identifiant de ligne de commande invalide.');
    }
    if (seenPoLines.has(poLineId)) {
      throw new BusinessError(
        'VALIDATION_ERROR',
        `Ligne de commande #${poLineId} dupliquée dans la même demande de réception. Regroupez les quantités sur une seule ligne.`
      );
    }
    seenPoLines.add(poLineId);
    const qtyMilli = positiveMilli(l.received_quantity, 'Quantité réceptionnée');
    normalizedLines.push({
      poLineId,
      qtyMilli,
      discrepancyReason: l.discrepancy_reason?.trim() || null,
    });
  }

  return withWriteTx((db) => {
    const dup = db
      .prepare('SELECT * FROM purchase_receipts WHERE request_key = ?')
      .get(requestKey) as { id: number; purchase_order_id: number } | undefined;
    if (dup) {
      if (dup.purchase_order_id !== purchaseOrderId) {
        throw new BusinessError(
          'DUPLICATE_OPERATION',
          "Cette clé d'idempotence a déjà été utilisée pour un autre bon de commande.",
          409
        );
      }
      return dup;
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as
      | { id: number; reference: string; supplier_id: number; status: string }
      | undefined;
    if (!po) throw new BusinessError('PURCHASE_NOT_FOUND', 'Bon de commande introuvable.', 404);
    if (po.status === 'cancelled' || po.status === 'received') {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Ce bon de commande est déjà clôturé ou annulé.');
    }

    const sup = db.prepare('SELECT payment_terms_days FROM suppliers WHERE id = ?').get(po.supplier_id) as {
      payment_terms_days: number;
    };

    let receiptTotal = 0;
    const preparedLines: Array<{
      poLineId: number;
      productId: number;
      qtyMilli: number;
      baseQtyMilli: number;
      unitPrice: number;
      amount: number;
      discrepancyReason: string | null;
    }> = [];

    for (const l of normalizedLines) {
      const pol = db
        .prepare('SELECT * FROM purchase_order_lines WHERE id = ? AND purchase_order_id = ?')
        .get(l.poLineId, purchaseOrderId) as
        | {
            id: number;
            product_id: number;
            coefficient_milli: number;
            ordered_quantity_milli: number;
            received_quantity_milli: number;
            unit_price: number;
          }
        | undefined;
      if (!pol) throw new BusinessError('VALIDATION_ERROR', 'Ligne de commande introuvable.');

      if (pol.received_quantity_milli >= pol.ordered_quantity_milli) {
        throw new BusinessError(
          'INVALID_QUANTITY',
          `La ligne de commande #${pol.id} a déjà été intégralement réceptionnée.`
        );
      }
      if (pol.received_quantity_milli + l.qtyMilli > pol.ordered_quantity_milli) {
        throw new BusinessError(
          'INVALID_QUANTITY',
          'La quantité reçue dépasse la quantité commandée restante.'
        );
      }

      const baseQtyMilli = multiplyQtyCoeffToBaseMilli(l.qtyMilli, pol.coefficient_milli);
      const amount = computeLineTotalFcfa(l.qtyMilli, pol.unit_price);
      receiptTotal = checkedAddMoney(receiptTotal, amount, 'Total réception');

      preparedLines.push({
        poLineId: pol.id,
        productId: pol.product_id,
        qtyMilli: l.qtyMilli,
        baseQtyMilli,
        unitPrice: pol.unit_price,
        amount,
        discrepancyReason: l.discrepancyReason,
      });
    }

    const recRef = nextSequence(db, 'REC');
    const receiptId = Number(
      db
        .prepare(
          'INSERT INTO purchase_receipts (reference, request_key, purchase_order_id, total_amount, notes) VALUES (?, ?, ?, ?, ?)'
        )
        .run(recRef, requestKey, purchaseOrderId, receiptTotal, input.notes?.trim() || null).lastInsertRowid
    );

    for (const pl of preparedLines) {
      const upd = db
        .prepare(
          `UPDATE purchase_order_lines
           SET received_quantity_milli = received_quantity_milli + ?
           WHERE id = ? AND purchase_order_id = ? AND received_quantity_milli + ? <= ordered_quantity_milli`
        )
        .run(pl.qtyMilli, pl.poLineId, purchaseOrderId, pl.qtyMilli);
      if (Number(upd.changes) !== 1) {
        throw new BusinessError(
          'INVALID_QUANTITY',
          'La quantité reçue dépasse la quantité commandée restante.'
        );
      }

      db.prepare(
        `INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_line_id, quantity_milli, base_quantity_milli, unit_price, amount, discrepancy_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(receiptId, pl.poLineId, pl.qtyMilli, pl.baseQtyMilli, pl.unitPrice, pl.amount, pl.discrepancyReason);

      // Mise à jour stock & coût moyen exact lorsque le coût unitaire de base est connu
      const prod = db
        .prepare('SELECT stock_milli, average_cost_num, average_cost_den FROM products WHERE id = ?')
        .get(pl.productId) as {
        stock_milli: number;
        average_cost_num: string | null;
        average_cost_den: string | null;
      };

      const nextStock = prod.stock_milli + pl.baseQtyMilli;
      // Calcul du coût moyen pondéré en unité de base (FCFA / 1 unité)
      let nextCostNum = prod.average_cost_num;
      let nextCostDen = prod.average_cost_den;

      if (pl.amount >= 0 && pl.baseQtyMilli > 0) {
        if (prod.stock_milli === 0 || (prod.average_cost_num && prod.average_cost_den)) {
          const oldNum = prod.average_cost_num ? BigInt(prod.average_cost_num) : 0n;
          const oldDen = prod.average_cost_den ? BigInt(prod.average_cost_den) : 1n;
          const oldValScaled = (BigInt(prod.stock_milli) * oldNum) / oldDen; // milli * FCFA
          const addedValScaled = BigInt(pl.amount) * 1000n;
          const totalNum = oldValScaled + addedValScaled;
          const totalDen = BigInt(nextStock);
          if (totalDen > 0n) {
            nextCostNum = totalNum.toString();
            nextCostDen = totalDen.toString();
          }
        }
      }

      db.prepare(
        'UPDATE products SET stock_milli = ?, average_cost_num = ?, average_cost_den = ? WHERE id = ?'
      ).run(nextStock, nextCostNum, nextCostDen, pl.productId);

      const unitBaseCost =
        pl.baseQtyMilli > 0 ? Number((BigInt(pl.amount) * 1000n) / BigInt(pl.baseQtyMilli)) : null;
      db.prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
         VALUES (?, 'purchase_in', ?, ?, ?, ?, ?, ?)`
      ).run(
        pl.productId,
        pl.baseQtyMilli,
        prod.stock_milli,
        nextStock,
        unitBaseCost,
        `Réception ${recRef} (CMD ${po.reference})`,
        recRef
      );
    }

    // Création dette fournisseur sur quantité réellement reçue
    let dueDate: string | null = null;
    if (sup.payment_terms_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + sup.payment_terms_days);
      dueDate = d.toISOString().slice(0, 10);
    }
    db.prepare(
      `INSERT INTO supplier_debts (receipt_id, supplier_id, initial_amount, remaining_amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, 'open')`
    ).run(receiptId, po.supplier_id, receiptTotal, receiptTotal, dueDate);

    // Mise à jour statut PO
    const remRow = db
      .prepare(
        'SELECT COALESCE(SUM(ordered_quantity_milli - received_quantity_milli), 0) AS rem FROM purchase_order_lines WHERE purchase_order_id = ?'
      )
      .get(purchaseOrderId) as { rem: number };
    db.prepare(
      'UPDATE purchase_orders SET received_amount = received_amount + ?, status = ? WHERE id = ?'
    ).run(receiptTotal, remRow.rem === 0 ? 'received' : 'partial', purchaseOrderId);

    auditLog(db, 'RECEIVE_PO', 'purchase_receipts', receiptId, `Réception ${recRef} sur ${po.reference} — ${receiptTotal} FCFA`);
    return db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').get(receiptId);
  });
}

export async function cancelPurchaseOrder(
  purchaseOrderId: number,
  input: { reason?: string }
) {
  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    throw new BusinessError('PURCHASE_NOT_FOUND', 'Bon de commande invalide.', 400);
  }
  const reason = (input.reason || '').trim();
  if (!reason) {
    throw new BusinessError('VALIDATION_ERROR', "Le motif d'annulation est obligatoire.");
  }

  return withWriteTx((db) => {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as
      | { id: number; reference: string; status: string; received_amount: number; notes: string | null }
      | undefined;
    if (!po) throw new BusinessError('PURCHASE_NOT_FOUND', 'Bon de commande introuvable.', 404);
    if (po.status === 'cancelled') {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Ce bon de commande est déjà annulé.');
    }
    const receiptCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM purchase_receipts WHERE purchase_order_id = ?')
        .get(purchaseOrderId) as { c: number }
    ).c;
    if (po.status === 'partial' || po.status === 'received' || po.received_amount > 0 || receiptCount > 0) {
      throw new BusinessError(
        'HISTORICAL_IMMUTABLE',
        "Impossible d'annuler un bon de commande ayant déjà fait l'objet d'une réception."
      );
    }

    const nextNotes = po.notes ? `${po.notes} · [Annulé : ${reason}]` : `[Annulé : ${reason}]`;
    db.prepare("UPDATE purchase_orders SET status = 'cancelled', notes = ? WHERE id = ?").run(
      nextNotes,
      purchaseOrderId
    );
    auditLog(
      db,
      'CANCEL_PURCHASE_ORDER',
      'purchase_orders',
      purchaseOrderId,
      `Annulation ${po.reference} — ${reason}`
    );
    return listPurchaseOrders().find((o) => o.id === purchaseOrderId);
  });
}

export async function paySupplierDebt(
  debtId: number,
  input: { method_code: string; amount: number; request_key: string; note?: string }
) {
  const amount = positiveFcfa(input.amount, 'Montant règlement fournisseur');
  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM payments WHERE request_key = ?').get(input.request_key);
    if (dup) return dup;

    const session = requireOpenSession(db);
    const debt = db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(debtId) as
      | { id: number; supplier_id: number; remaining_amount: number }
      | undefined;
    if (!debt) throw new BusinessError('VALIDATION_ERROR', 'Dette fournisseur introuvable.');
    if (amount > debt.remaining_amount) {
      throw new BusinessError('INVALID_PAYMENT', 'Le règlement dépasse le solde fournisseur restant.');
    }

    const pm = db.prepare('SELECT code, is_cash, active FROM payment_methods WHERE code = ?').get(input.method_code) as
      | { code: string; is_cash: number; active: number }
      | undefined;
    if (!pm || !pm.active) throw new BusinessError('INVALID_PAYMENT', 'Moyen de paiement invalide.');

    if (pm.is_cash === 1) {
      const avail = getTheoreticalCash(db, session.id, session.opening_cash);
      if (amount > avail) {
        throw new BusinessError('INVALID_PAYMENT', 'Espèces insuffisantes en caisse pour ce règlement fournisseur.');
      }
    }

    const payRef = nextSequence(db, 'REC');
    const paymentId = Number(
      db
        .prepare(
          `INSERT INTO payments (reference, request_key, payment_kind, total_amount, note)
           VALUES (?, ?, 'supplier_debt', ?, ?)`
        )
        .run(payRef, input.request_key, amount, input.note?.trim() || null).lastInsertRowid
    );
    const partId = Number(
      db.prepare('INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)').run(
        paymentId,
        pm.code,
        amount
      ).lastInsertRowid
    );
    db.prepare(
      `INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
       VALUES (?, ?, ?, 'supplier_payment', ?, 'out', ?, ?, ?)`
    ).run(
      session.id,
      `cm-sup:${input.request_key}`,
      partId,
      pm.code,
      amount,
      `Règlement fournisseur dette #${debt.id}`,
      payRef
    );

    const nextRem = debt.remaining_amount - amount;
    db.prepare('UPDATE supplier_debts SET remaining_amount = ?, status = ? WHERE id = ?').run(
      nextRem,
      nextRem === 0 ? 'paid' : 'partial',
      debt.id
    );

    auditLog(db, 'PAY_SUPPLIER_DEBT', 'supplier_debts', debt.id, `${payRef} — ${amount} FCFA`);
    return db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(debt.id);
  });
}

export function listSupplierDebts() {
  const db = getDb();
  return db
    .prepare(
      `SELECT sd.*, s.name AS supplier_name, s.code AS supplier_code, pr.reference AS receipt_reference, po.reference AS order_reference
       FROM supplier_debts sd
       JOIN suppliers s ON s.id = sd.supplier_id
       JOIN purchase_receipts pr ON pr.id = sd.receipt_id
       JOIN purchase_orders po ON po.id = pr.purchase_order_id
       ORDER BY sd.status ASC, sd.id DESC`
    )
    .all();
}
