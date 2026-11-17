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
  checkedAddMoney,
  computeLineTotalFcfa,
  multiplyQtyCoeffToBaseMilli,
  nonNegativeFcfa,
  positiveFcfa,
  positiveMilli,
} from '../domain.ts';

export function listClients(search?: string) {
  const db = getDb();
  const q = search?.trim() ? `%${search.trim()}%` : null;
  const where = q ? 'WHERE (c.name LIKE ? OR c.code LIKE ? OR COALESCE(c.phone, \'\') LIKE ?)' : '';
  const params = q ? [q, q, q] : [];
  return db
    .prepare(
      `SELECT c.*, ccs.policy AS credit_policy, ccs.credit_limit, ccs.payment_terms_days,
              COALESCE((SELECT SUM(remaining_amount) FROM customer_receivables r WHERE r.client_id = c.id AND r.status IN ('open', 'partial')), 0) AS unpaid_balance,
              COALESCE((SELECT SUM(balance_pieces) FROM customer_packaging_accounts cpa WHERE cpa.client_id = c.id), 0) AS returnable_pieces_due
       FROM clients c
       LEFT JOIN client_credit_settings ccs ON ccs.client_id = c.id
       ${where}
       ORDER BY c.is_active DESC, c.name ASC`
    )
    .all(...params);
}

export async function createClient(input: {
  name: string;
  client_type: 'particulier' | 'professionnel';
  phone?: string;
  address?: string;
  city?: string;
  email?: string;
  contact_person?: string;
  credit_policy: 'forbidden' | 'limited' | 'unlimited';
  credit_limit?: number | null;
  payment_terms_days?: number;
}) {
  const name = (input.name || '').trim();
  if (!name) throw new BusinessError('VALIDATION_ERROR', 'Le nom du client est obligatoire.');
  if (!['particulier', 'professionnel'].includes(input.client_type)) {
    throw new BusinessError('VALIDATION_ERROR', 'Type de client invalide.');
  }
  if (!['forbidden', 'limited', 'unlimited'].includes(input.credit_policy)) {
    throw new BusinessError('VALIDATION_ERROR', 'Politique de crédit explicite requise.');
  }
  let limit: number | null = null;
  if (input.credit_policy === 'limited') {
    limit = nonNegativeFcfa(input.credit_limit, 'Plafond de crédit');
  }
  const terms = Number(input.payment_terms_days ?? 0);
  if (!Number.isInteger(terms) || terms < 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Délai de paiement invalide.');
  }

  return withWriteTx((db) => {
    const code = nextSequence(db, 'CLI');
    const clientId = Number(
      db
        .prepare(
          'INSERT INTO clients (code, name, client_type, phone, address, city, email, contact_person) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          code,
          name,
          input.client_type,
          input.phone?.trim() || null,
          input.address?.trim() || null,
          input.city?.trim() || null,
          input.email?.trim() || null,
          input.contact_person?.trim() || null
        ).lastInsertRowid
    );
    db.prepare(
      'INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, ?, ?, ?)'
    ).run(clientId, input.credit_policy, limit, terms);
    auditLog(db, 'CREATE_CLIENT', 'clients', clientId, `${code} — ${name} (${input.credit_policy})`);
    return db
      .prepare(
        `SELECT c.*, ccs.policy AS credit_policy, ccs.credit_limit, ccs.payment_terms_days,
                0 AS unpaid_balance, 0 AS returnable_pieces_due
         FROM clients c JOIN client_credit_settings ccs ON ccs.client_id = c.id WHERE c.id = ?`
      )
      .get(clientId);
  });
}

export async function updateClient(
  clientId: number,
  input: {
    name?: string;
    client_type?: 'particulier' | 'professionnel';
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    email?: string | null;
    contact_person?: string | null;
    is_active?: boolean;
  }
) {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new BusinessError('CLIENT_NOT_FOUND', 'Client invalide.', 400);
  }
  return withWriteTx((db) => {
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as
      | {
          id: number;
          code: string;
          name: string;
          client_type: 'particulier' | 'professionnel';
          phone: string | null;
          address: string | null;
          city: string | null;
          email: string | null;
          contact_person: string | null;
          is_active: number;
        }
      | undefined;
    if (!existing) throw new BusinessError('CLIENT_NOT_FOUND', 'Client introuvable.', 404);

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    if (!name) throw new BusinessError('VALIDATION_ERROR', 'Le nom du client est obligatoire.');

    const clientType = input.client_type !== undefined ? input.client_type : existing.client_type;
    if (!['particulier', 'professionnel'].includes(clientType)) {
      throw new BusinessError('VALIDATION_ERROR', 'Type de client invalide.');
    }

    const optText = (val: string | null | undefined, prev: string | null) =>
      val === undefined ? prev : val?.trim() || null;

    const phone = optText(input.phone, existing.phone);
    const address = optText(input.address, existing.address);
    const city = optText(input.city, existing.city);
    const email = optText(input.email, existing.email);
    const contactPerson = optText(input.contact_person, existing.contact_person);
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active;

    db.prepare(
      `UPDATE clients
       SET name = ?, client_type = ?, phone = ?, address = ?, city = ?, email = ?, contact_person = ?, is_active = ?
       WHERE id = ?`
    ).run(name, clientType, phone, address, city, email, contactPerson, isActive, clientId);

    auditLog(db, 'UPDATE_CLIENT', 'clients', clientId, `${existing.code} — ${name}`);
    return db
      .prepare(
        `SELECT c.*, ccs.policy AS credit_policy, ccs.credit_limit, ccs.payment_terms_days,
                COALESCE((SELECT SUM(remaining_amount) FROM customer_receivables r WHERE r.client_id = c.id AND r.status IN ('open', 'partial')), 0) AS unpaid_balance,
                COALESCE((SELECT SUM(balance_pieces) FROM customer_packaging_accounts cpa WHERE cpa.client_id = c.id), 0) AS returnable_pieces_due
         FROM clients c
         LEFT JOIN client_credit_settings ccs ON ccs.client_id = c.id
         WHERE c.id = ?`
      )
      .get(clientId);
  });
}

export async function updateClientCreditPolicy(
  clientId: number,
  input: {
    credit_policy: 'forbidden' | 'limited' | 'unlimited';
    credit_limit?: number | null;
    payment_terms_days?: number;
  }
) {
  let limit: number | null = null;
  if (input.credit_policy === 'limited') {
    limit = nonNegativeFcfa(input.credit_limit, 'Plafond de crédit');
  }
  const terms = Number(input.payment_terms_days ?? 0);
  if (!Number.isInteger(terms) || terms < 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Délai de paiement invalide.');
  }

  return withWriteTx((db) => {
    const cli = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
    if (!cli) throw new BusinessError('CLIENT_NOT_FOUND', 'Client introuvable.', 404);
    db.prepare(
      `INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(client_id) DO UPDATE SET
         policy = excluded.policy,
         credit_limit = excluded.credit_limit,
         payment_terms_days = excluded.payment_terms_days,
         updated_at = datetime('now')`
    ).run(clientId, input.credit_policy, limit, terms);
    auditLog(db, 'UPDATE_CLIENT_CREDIT', 'clients', clientId, `Politique ${input.credit_policy}`);
    return db.prepare('SELECT * FROM client_credit_settings WHERE client_id = ?').get(clientId);
  });
}

export interface CreateSaleInput {
  request_key: string;
  client_id?: number | null;
  sale_type: 'cash' | 'credit';
  price_tier: 'wholesale' | 'semi_wholesale' | 'retail';
  discount_amount?: number;
  notes?: string;
  lines: Array<{
    product_id: number;
    packaging_id: number;
    quantity: string | number;
    discount_amount?: number;
  }>;
  payments: Array<{
    method_code: string;
    amount: number;
  }>;
  due_date?: string | null;
}

export async function createSale(input: CreateSaleInput) {
  const requestKey = (input.request_key || '').trim();
  if (!requestKey) throw new BusinessError('VALIDATION_ERROR', "Clé d'idempotence requise.");
  if (!input.lines?.length) {
    throw new BusinessError('VALIDATION_ERROR', 'La vente doit comporter au moins une ligne.');
  }
  if (!['cash', 'credit'].includes(input.sale_type)) {
    throw new BusinessError('VALIDATION_ERROR', 'Type de vente invalide.');
  }
  if (!['wholesale', 'semi_wholesale', 'retail'].includes(input.price_tier)) {
    throw new BusinessError('VALIDATION_ERROR', 'Grille tarifaire invalide.');
  }
  const globalDiscount = nonNegativeFcfa(input.discount_amount ?? 0, 'Remise globale');

  return withWriteTx((db) => {
    const existingSale = db.prepare('SELECT * FROM sales WHERE request_key = ?').get(requestKey);
    if (existingSale) {
      return getSaleDetail(Number((existingSale as { id: number }).id));
    }

    const session = requireOpenSession(db);
    const settings = db.prepare('SELECT allow_negative_stock, sale_prefix FROM app_settings WHERE id = 1').get() as {
      allow_negative_stock: number;
      sale_prefix: string;
    };

    let client: { id: number; name: string; is_active: number } | undefined;
    let creditSetting: { policy: string; credit_limit: number | null; payment_terms_days: number } | undefined;
    if (input.client_id) {
      client = db
        .prepare('SELECT id, name, is_active FROM clients WHERE id = ?')
        .get(input.client_id) as { id: number; name: string; is_active: number } | undefined;
      if (!client || !client.is_active) {
        throw new BusinessError('CLIENT_NOT_FOUND', 'Client actif introuvable.');
      }
      creditSetting = db
        .prepare('SELECT policy, credit_limit, payment_terms_days FROM client_credit_settings WHERE client_id = ?')
        .get(client.id) as { policy: string; credit_limit: number | null; payment_terms_days: number } | undefined;
    }

    if (input.sale_type === 'credit') {
      if (!client) {
        throw new BusinessError('CREDIT_FORBIDDEN', 'Une vente à crédit doit obligatoirement être liée à un client.');
      }
      if (!creditSetting || creditSetting.policy === 'forbidden') {
        throw new BusinessError(
          'CREDIT_FORBIDDEN',
          `Le crédit n'est pas autorisé pour le client "${client.name}". Configurez sa politique de crédit.`
        );
      }
    }

    interface PreparedLine {
      productId: number;
      productName: string;
      packagingId: number;
      packagingName: string;
      baseUnit: string;
      coeffMilli: number;
      qtyMilli: number;
      baseQtyMilli: number;
      unitPrice: number;
      lineDiscount: number;
      lineTotal: number;
      costNum: string | null;
      costDen: string | null;
      depositItems: Array<{ returnableId: number; pieces: number; unitValue: number; amount: number }>;
    }

    const preparedLines: PreparedLine[] = [];
    const productDeductions = new Map<number, number>();
    let subtotalMerchandise = 0;
    let totalDeposit = 0;

    for (const line of input.lines) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(line.product_id) as
        | Record<string, unknown>
        | undefined;
      if (!prod || !prod.is_active) {
        throw new BusinessError('PRODUCT_NOT_FOUND', `Produit #${line.product_id} introuvable ou archivé.`);
      }
      const pkg = db
        .prepare('SELECT * FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1')
        .get(line.packaging_id, line.product_id) as Record<string, unknown> | undefined;
      if (!pkg) {
        throw new BusinessError('PACKAGING_NOT_FOUND', `Conditionnement invalide pour "${prod.name}".`);
      }

      const qtyMilli = positiveMilli(line.quantity, `Quantité (${prod.name})`);
      if (!pkg.allow_fraction && qtyMilli % 1000 !== 0) {
        throw new BusinessError(
          'INVALID_QUANTITY',
          `Les quantités fractionnaires ne sont pas autorisées pour "${prod.name} (${pkg.name})".`
        );
      }

      const coeffMilli = Number(pkg.coefficient_milli);
      const baseQtyMilli = multiplyQtyCoeffToBaseMilli(qtyMilli, coeffMilli);

      const priceCol =
        input.price_tier === 'wholesale'
          ? 'wholesale_price'
          : input.price_tier === 'semi_wholesale'
          ? 'semi_wholesale_price'
          : 'retail_price';

      const pkgPrice = pkg[priceCol] as number | null;
      if (pkgPrice === null || pkgPrice === undefined) {
        throw new BusinessError(
          'VALIDATION_ERROR',
          `Tarif "${input.price_tier}" non configuré pour ${prod.name} (${pkg.name}).`
        );
      }
      const unitPrice = nonNegativeFcfa(pkgPrice, `Tarif ${prod.name}`);
      const grossLine = computeLineTotalFcfa(qtyMilli, unitPrice);
      const lineDiscount = nonNegativeFcfa(line.discount_amount ?? 0, 'Remise ligne');
      if (lineDiscount > grossLine) {
        throw new BusinessError('VALIDATION_ERROR', `Remise supérieure au montant de la ligne (${prod.name}).`);
      }
      const lineTotal = grossLine - lineDiscount;
      subtotalMerchandise = checkedAddMoney(subtotalMerchandise, lineTotal, 'Sous-total marchandises');

      // Vérification explicite du profil de consigne
      const depProfile = db
        .prepare('SELECT mode FROM deposit_packaging_profiles WHERE packaging_id = ?')
        .get(Number(pkg.id)) as { mode: string } | undefined;
      if (!depProfile) {
        throw new BusinessError(
          'DEPOSIT_PROFILE_MISSING',
          `Le profil de consigne de "${prod.name} (${pkg.name})" n'est pas encore configuré.`
        );
      }

      const depositItems: Array<{ returnableId: number; pieces: number; unitValue: number; amount: number }> = [];
      if (depProfile.mode === 'deposit') {
        if (qtyMilli % 1000 !== 0) {
          throw new BusinessError(
            'INVALID_QUANTITY',
            `Les emballages consignés exigent des quantités entières (${prod.name}).`
          );
        }
        const packs = qtyMilli / 1000;
        const comps = db
          .prepare(
            `SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.deposit_value
             FROM deposit_packaging_components dpc
             JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
             WHERE dpc.packaging_id = ?`
          )
          .all(Number(pkg.id)) as Array<{ returnable_id: number; pieces_per_pack: number; deposit_value: number }>;
        if (!comps.length) {
          throw new BusinessError(
            'DEPOSIT_PROFILE_MISSING',
            `Aucun emballage consigné lié à "${prod.name} (${pkg.name})".`
          );
        }
        for (const comp of comps) {
          const pieces = packs * comp.pieces_per_pack;
          const amt = pieces * comp.deposit_value;
          totalDeposit = checkedAddMoney(totalDeposit, amt, 'Total consignes');
          depositItems.push({
            returnableId: comp.returnable_id,
            pieces,
            unitValue: comp.deposit_value,
            amount: amt,
          });
        }
      }

      productDeductions.set(
        Number(prod.id),
        (productDeductions.get(Number(prod.id)) || 0) + baseQtyMilli
      );

      preparedLines.push({
        productId: Number(prod.id),
        productName: String(prod.name),
        packagingId: Number(pkg.id),
        packagingName: String(pkg.name),
        baseUnit: String(prod.base_unit),
        coeffMilli,
        qtyMilli,
        baseQtyMilli,
        unitPrice,
        lineDiscount,
        lineTotal,
        costNum: (prod.average_cost_num as string | null) ?? null,
        costDen: (prod.average_cost_den as string | null) ?? null,
        depositItems,
      });
    }

    if (globalDiscount > subtotalMerchandise) {
      throw new BusinessError('VALIDATION_ERROR', 'La remise globale dépasse le sous-total marchandises.');
    }

    // Contrôle stock disponible par produit
    for (const [productId, neededMilli] of productDeductions.entries()) {
      const prod = db
        .prepare('SELECT name, stock_milli FROM products WHERE id = ?')
        .get(productId) as { name: string; stock_milli: number };
      if (!settings.allow_negative_stock && prod.stock_milli < neededMilli) {
        throw new BusinessError(
          'INSUFFICIENT_STOCK',
          `Stock insuffisant pour "${prod.name}" (disponible : ${prod.stock_milli / 1000}, requis : ${neededMilli / 1000}).`
        );
      }
    }

    const totalMerchandise = subtotalMerchandise - globalDiscount;
    const totalAmount = checkedAddMoney(totalMerchandise, totalDeposit, 'Total vente');
    if (totalAmount <= 0) {
      throw new BusinessError('INVALID_MONEY', 'Le total de la vente doit être strictement positif.');
    }

    // Validation des paiements
    const normalizedPayments: Array<{ methodCode: string; amount: number; isCash: boolean }> = [];
    let paidAmount = 0;
    for (const p of input.payments || []) {
      const amt = positiveFcfa(p.amount, `Montant (${p.method_code})`);
      const pm = db
        .prepare('SELECT code, is_cash, active FROM payment_methods WHERE code = ?')
        .get(p.method_code) as { code: string; is_cash: number; active: number } | undefined;
      if (!pm || !pm.active) {
        throw new BusinessError('INVALID_PAYMENT', `Moyen de paiement inactif ou introuvable : ${p.method_code}`);
      }
      paidAmount = checkedAddMoney(paidAmount, amt, 'Total encaissé');
      normalizedPayments.push({ methodCode: pm.code, amount: amt, isCash: pm.is_cash === 1 });
    }

    if (input.sale_type === 'cash' && paidAmount !== totalAmount) {
      throw new BusinessError(
        'INVALID_PAYMENT',
        `Une vente au comptant doit être intégralement encaissée (attendu : ${totalAmount} FCFA, reçu : ${paidAmount} FCFA).`
      );
    }
    if (input.sale_type === 'credit' && paidAmount >= totalAmount) {
      throw new BusinessError(
        'INVALID_PAYMENT',
        'Pour une vente entièrement payée, utilisez le type de vente au comptant.'
      );
    }

    const creditAmount = totalAmount - paidAmount;
    if (input.sale_type === 'credit' && creditSetting?.policy === 'limited') {
      const currentDebtRow = db
        .prepare(
          "SELECT COALESCE(SUM(remaining_amount), 0) AS due FROM customer_receivables WHERE client_id = ? AND status IN ('open', 'partial')"
        )
        .get(client!.id) as { due: number };
      const nextTotalDebt = currentDebtRow.due + creditAmount;
      if (creditSetting.credit_limit !== null && nextTotalDebt > creditSetting.credit_limit) {
        throw new BusinessError(
          'CREDIT_LIMIT_EXCEEDED',
          `Plafond de crédit dépassé pour "${client!.name}" (encours après vente : ${nextTotalDebt} FCFA > plafond ${creditSetting.credit_limit} FCFA).`
        );
      }
    }

    const saleRef = nextSequence(db, settings.sale_prefix || 'VTE');
    const saleId = Number(
      db
        .prepare(
          `INSERT INTO sales (reference, request_key, client_id, sale_type, price_tier, subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?)`
        )
        .run(
          saleRef,
          requestKey,
          client?.id ?? null,
          input.sale_type,
          input.price_tier,
          subtotalMerchandise,
          globalDiscount,
          totalMerchandise,
          totalDeposit,
          totalAmount,
          paidAmount,
          input.notes?.trim() || null
        ).lastInsertRowid
    );

    for (const line of preparedLines) {
      const lineId = Number(
        db
          .prepare(
            `INSERT INTO sale_lines (sale_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total, cost_num, cost_den)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            saleId,
            line.productId,
            line.packagingId,
            line.productName,
            line.packagingName,
            line.baseUnit,
            line.coeffMilli,
            line.qtyMilli,
            line.baseQtyMilli,
            line.unitPrice,
            line.lineDiscount,
            line.lineTotal,
            line.costNum,
            line.costDen
          ).lastInsertRowid
      );

      // Déduction stock & mouvement traçable
      const prod = db.prepare('SELECT stock_milli FROM products WHERE id = ?').get(line.productId) as {
        stock_milli: number;
      };
      const nextStock = prod.stock_milli - line.baseQtyMilli;
      db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(nextStock, line.productId);
      db.prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
         VALUES (?, 'sale_out', ?, ?, ?, ?, ?)`
      ).run(
        line.productId,
        -line.baseQtyMilli,
        prod.stock_milli,
        nextStock,
        `Vente ${saleRef} (${line.packagingName})`,
        saleRef
      );

      // Consignes sorties
      for (const dep of line.depositItems) {
        db.prepare(
          `INSERT INTO deposit_issues (sale_id, sale_line_id, client_id, returnable_id, pieces, unit_value, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(saleId, lineId, client?.id ?? null, dep.returnableId, dep.pieces, dep.unitValue, dep.amount);

        if (client) {
          db.prepare(
            `INSERT INTO customer_packaging_accounts (client_id, returnable_id, balance_pieces, deposit_held_amount)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(client_id, returnable_id) DO UPDATE SET
               balance_pieces = balance_pieces + excluded.balance_pieces,
               deposit_held_amount = deposit_held_amount + excluded.deposit_held_amount`
          ).run(client.id, dep.returnableId, dep.pieces, dep.amount);
        }
      }
    }

    // Paiements & mouvements de trésorerie
    if (paidAmount > 0) {
      const payRef = nextSequence(db, 'REC');
      const paymentId = Number(
        db
          .prepare(
            `INSERT INTO payments (reference, request_key, sale_id, client_id, payment_kind, total_amount, note)
             VALUES (?, ?, ?, ?, 'sale', ?, ?)`
          )
          .run(payRef, `pay-sale:${requestKey}`, saleId, client?.id ?? null, paidAmount, `Encaissement vente ${saleRef}`)
          .lastInsertRowid
      );

      normalizedPayments.forEach((part, idx) => {
        const partId = Number(
          db
            .prepare('INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)')
            .run(paymentId, part.methodCode, part.amount).lastInsertRowid
        );
        db.prepare(
          `INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
           VALUES (?, ?, ?, 'sale', ?, 'in', ?, ?, ?)`
        ).run(
          session.id,
          `cm-sale:${requestKey}:${idx}`,
          partId,
          part.methodCode,
          part.amount,
          `Encaissement ${saleRef}`,
          saleRef
        );
      });
    }

    // Créance client si vente à crédit
    if (creditAmount > 0 && client) {
      let dueDate = input.due_date || null;
      if (!dueDate && creditSetting && creditSetting.payment_terms_days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + creditSetting.payment_terms_days);
        dueDate = d.toISOString().slice(0, 10);
      }
      db.prepare(
        `INSERT INTO customer_receivables (sale_id, client_id, initial_amount, remaining_amount, due_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(saleId, client.id, creditAmount, creditAmount, dueDate, paidAmount > 0 ? 'partial' : 'open');
    }

    auditLog(
      db,
      'CREATE_SALE',
      'sales',
      saleId,
      `${saleRef} — Total ${totalAmount} FCFA (Payé ${paidAmount} FCFA, Consigne ${totalDeposit} FCFA)`
    );

    return getSaleDetail(saleId);
  });
}

export function listSales(
  filter: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const db = getDb();
  const page = Math.max(1, Number(filter.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize || 25)));
  const offset = (page - 1) * pageSize;

  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status && filter.status !== 'all') {
    clauses.push('s.status = ?');
    params.push(filter.status);
  }
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim()}%`;
    clauses.push("(s.reference LIKE ? OR COALESCE(c.name, 'Client Comptoir') LIKE ?)");
    params.push(q, q);
  }
  if (filter.from?.trim()) {
    clauses.push('substr(s.created_at, 1, 10) >= ?');
    params.push(filter.from.trim());
  }
  if (filter.to?.trim()) {
    clauses.push('substr(s.created_at, 1, 10) <= ?');
    params.push(filter.to.trim());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM sales s LEFT JOIN clients c ON c.id = s.client_id ${where}`).get(...params) as { c: number }).c;

  const items = db
    .prepare(
      `SELECT s.*, COALESCE(c.name, 'Client Comptoir') AS client_name,
              COALESCE(cr.remaining_amount, 0) AS remaining_amount,
              (SELECT GROUP_CONCAT(DISTINCT pm.label)
               FROM payments p JOIN payment_parts pp ON pp.payment_id = p.id JOIN payment_methods pm ON pm.code = pp.method_code
               WHERE p.sale_id = s.id) AS payment_labels
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
       ${where}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function getSaleDetail(saleId: number) {
  const db = getDb();
  const sale = db
    .prepare(
      `SELECT s.*, COALESCE(c.name, 'Client Comptoir') AS client_name, c.code AS client_code, c.phone AS client_phone,
              cr.id AS receivable_id, COALESCE(cr.remaining_amount, 0) AS remaining_amount, cr.due_date
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
       WHERE s.id = ?`
    )
    .get(saleId);
  if (!sale) throw new BusinessError('SALE_NOT_FOUND', 'Vente introuvable.', 404);

  const lines = db
    .prepare(
      `SELECT sl.*, COALESCE((SELECT SUM(srl.base_quantity_milli) FROM sales_return_lines srl WHERE srl.sale_line_id = sl.id), 0) AS returned_base_milli
       FROM sale_lines sl WHERE sl.sale_id = ?`
    )
    .all(saleId);
  const payments = db
    .prepare(
      `SELECT p.*, pp.method_code, pp.amount AS part_amount, pm.label AS method_label
       FROM payments p
       JOIN payment_parts pp ON pp.payment_id = p.id
       JOIN payment_methods pm ON pm.code = pp.method_code
       WHERE p.sale_id = ? ORDER BY p.id ASC`
    )
    .all(saleId);
  const deposits = db
    .prepare(
      `SELECT di.*, rpt.name AS packaging_name, rpt.code AS packaging_code
       FROM deposit_issues di
       JOIN returnable_packaging_types rpt ON rpt.id = di.returnable_id
       WHERE di.sale_id = ?`
    )
    .all(saleId);
  const cancellation = db.prepare('SELECT * FROM sales_cancellations WHERE sale_id = ?').get(saleId) || null;
  const returns = db.prepare('SELECT * FROM sales_returns WHERE sale_id = ? ORDER BY id DESC').all(saleId);

  return { ...(sale as object), lines, payments, deposits, cancellation, returns };
}

export async function cancelSale(
  saleId: number,
  input: { reason: string; refund_method_code?: string; request_key: string }
) {
  const reason = (input.reason || '').trim();
  if (!reason) throw new BusinessError('VALIDATION_ERROR', "Le motif d'annulation est obligatoire.");

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM sales_cancellations WHERE request_key = ?').get(input.request_key);
    if (dup) return getSaleDetail(saleId);

    const session = requireOpenSession(db);
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as
      | { id: number; reference: string; status: string; paid_amount: number; client_id: number | null }
      | undefined;
    if (!sale) throw new BusinessError('SALE_NOT_FOUND', 'Vente introuvable.', 404);
    if (sale.status === 'cancelled') {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Cette vente est déjà annulée.');
    }

    const activeReturns = db.prepare('SELECT COUNT(*) AS c FROM sales_returns WHERE sale_id = ?').get(saleId) as {
      c: number;
    };
    if (activeReturns.c > 0) {
      throw new BusinessError(
        'HISTORICAL_IMMUTABLE',
        'Impossible d’annuler une vente ayant déjà fait l’objet d’un retour partiel.'
      );
    }

    // Contre-écriture stock
    const lines = db.prepare('SELECT * FROM sale_lines WHERE sale_id = ?').all(saleId) as Array<{
      product_id: number;
      base_quantity_milli: number;
    }>;
    for (const line of lines) {
      const prod = db.prepare('SELECT stock_milli FROM products WHERE id = ?').get(line.product_id) as {
        stock_milli: number;
      };
      const nextStock = prod.stock_milli + line.base_quantity_milli;
      db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(nextStock, line.product_id);
      db.prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
         VALUES (?, 'sale_cancel_in', ?, ?, ?, ?, ?)`
      ).run(
        line.product_id,
        line.base_quantity_milli,
        prod.stock_milli,
        nextStock,
        `Annulation vente ${sale.reference} : ${reason}`,
        sale.reference
      );
    }

    // Annuler créance éventuelle
    db.prepare("UPDATE customer_receivables SET remaining_amount = 0, status = 'cancelled' WHERE sale_id = ?").run(
      saleId
    );

    // Annuler soldes consignes si liés à un client
    const deposits = db.prepare('SELECT * FROM deposit_issues WHERE sale_id = ?').all(saleId) as Array<{
      client_id: number | null;
      returnable_id: number;
      pieces: number;
      returned_pieces: number;
      amount: number;
    }>;
    for (const d of deposits) {
      if (d.returned_pieces > 0) {
        throw new BusinessError(
          'HISTORICAL_IMMUTABLE',
          'Des vides ont déjà été retournés sur cette vente. Annulez ou clôturez d’abord les retours de consignes.'
        );
      }
      if (d.client_id) {
        db.prepare(
          `UPDATE customer_packaging_accounts
           SET balance_pieces = MAX(0, balance_pieces - ?),
               deposit_held_amount = MAX(0, deposit_held_amount - ?)
           WHERE client_id = ? AND returnable_id = ?`
        ).run(d.pieces, d.amount, d.client_id, d.returnable_id);
      }
    }

    // Remboursement si des montants ont été encaissés
    const totalPaidRow = db
      .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments WHERE sale_id = ? AND payment_kind IN ('sale', 'receivable')")
      .get(saleId) as { s: number };
    const refundedAmount = totalPaidRow.s;
    const refundMethod = input.refund_method_code || 'cash';

    if (refundedAmount > 0) {
      if (refundMethod === 'cash') {
        const avail = getTheoreticalCash(db, session.id, session.opening_cash);
        if (refundedAmount > avail) {
          throw new BusinessError('INVALID_PAYMENT', 'Espèces insuffisantes en caisse pour rembourser cette vente.');
        }
      }
      db.prepare(
        `INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, 'sale_refund', ?, 'out', ?, ?, ?)`
      ).run(
        session.id,
        `cancel-ref:${input.request_key}`,
        refundMethod,
        refundedAmount,
        `Annulation ${sale.reference} — ${reason}`,
        sale.reference
      );
    }

    db.prepare(
      `INSERT INTO sales_cancellations (sale_id, session_id, request_key, reason, refund_method_code, refunded_amount)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(saleId, session.id, input.request_key, reason, refundedAmount > 0 ? refundMethod : null, refundedAmount);

    db.prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?").run(saleId);
    auditLog(db, 'CANCEL_SALE', 'sales', saleId, `Annulation ${sale.reference} (${reason})`);
    return getSaleDetail(saleId);
  });
}

export async function createSaleReturn(
  saleId: number,
  input: {
    request_key: string;
    reason: string;
    restock_approved: boolean;
    refund_method_code: string;
    lines: Array<{ sale_line_id: number; base_quantity: string | number }>;
  }
) {
  const reason = (input.reason || '').trim();
  if (!reason) throw new BusinessError('VALIDATION_ERROR', 'Le motif du retour est obligatoire.');
  if (!input.lines?.length) throw new BusinessError('VALIDATION_ERROR', 'Sélectionnez au moins un article à retourner.');

  return withWriteTx((db) => {
    const dup = db.prepare('SELECT * FROM sales_returns WHERE request_key = ?').get(input.request_key);
    if (dup) return getSaleDetail(saleId);

    const session = requireOpenSession(db);
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as
      | { id: number; reference: string; status: string }
      | undefined;
    if (!sale) throw new BusinessError('SALE_NOT_FOUND', 'Vente introuvable.', 404);
    if (sale.status === 'cancelled') {
      throw new BusinessError('HISTORICAL_IMMUTABLE', 'Impossible de créer un retour sur une vente annulée.');
    }

    const settings = db.prepare('SELECT credit_note_prefix FROM app_settings WHERE id = 1').get() as {
      credit_note_prefix: string;
    };

    let totalReturnAmount = 0;
    const prepared: Array<{ saleLineId: number; productId: number; baseQtyMilli: number; amount: number }> = [];

    for (const l of input.lines) {
      const baseQtyMilli = positiveMilli(l.base_quantity, 'Quantité retournée');
      const sl = db.prepare('SELECT * FROM sale_lines WHERE id = ? AND sale_id = ?').get(l.sale_line_id, saleId) as
        | {
            id: number;
            product_id: number;
            base_quantity_milli: number;
            line_total: number;
          }
        | undefined;
      if (!sl) throw new BusinessError('VALIDATION_ERROR', 'Ligne de vente introuvable.');

      const prevRet = db
        .prepare('SELECT COALESCE(SUM(base_quantity_milli), 0) AS s FROM sales_return_lines WHERE sale_line_id = ?')
        .get(sl.id) as { s: number };

      if (prevRet.s + baseQtyMilli > sl.base_quantity_milli) {
        throw new BusinessError('INVALID_QUANTITY', 'Quantité retournée supérieure à la quantité vendue restante.');
      }

      const exactProd = BigInt(sl.line_total) * BigInt(baseQtyMilli);
      const denom = BigInt(sl.base_quantity_milli);
      if (exactProd % denom !== 0n) {
        throw new BusinessError(
          'INVALID_MONEY',
          'La fraction retournée ne correspond pas à un nombre entier de FCFA.'
        );
      }
      const lineAmount = Number(exactProd / denom);
      totalReturnAmount = checkedAddMoney(totalReturnAmount, lineAmount, 'Total retour');
      prepared.push({ saleLineId: sl.id, productId: sl.product_id, baseQtyMilli, amount: lineAmount });
    }

    // Répartition : réduction créance d'abord, puis remboursement en caisse
    let creditReduction = 0;
    let refundAmount = totalReturnAmount;
    const rec = db
      .prepare("SELECT id, remaining_amount FROM customer_receivables WHERE sale_id = ? AND status IN ('open', 'partial')")
      .get(saleId) as { id: number; remaining_amount: number } | undefined;
    if (rec && rec.remaining_amount > 0) {
      creditReduction = Math.min(rec.remaining_amount, totalReturnAmount);
      refundAmount = totalReturnAmount - creditReduction;
      const nextRem = rec.remaining_amount - creditReduction;
      db.prepare('UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?').run(
        nextRem,
        nextRem === 0 ? 'paid' : 'partial',
        rec.id
      );
    }

    if (refundAmount > 0 && input.refund_method_code === 'cash') {
      const avail = getTheoreticalCash(db, session.id, session.opening_cash);
      if (refundAmount > avail) {
        throw new BusinessError('INVALID_PAYMENT', 'Espèces insuffisantes en caisse pour le remboursement.');
      }
    }

    const retRef = nextSequence(db, 'RET');
    const avoRef = nextSequence(db, settings.credit_note_prefix || 'AVO');

    const retId = Number(
      db
        .prepare(
          `INSERT INTO sales_returns (reference, credit_note_ref, request_key, sale_id, session_id, total_amount, credit_reduction, refund_amount, refund_method_code, restock_approved, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          retRef,
          avoRef,
          input.request_key,
          saleId,
          session.id,
          totalReturnAmount,
          creditReduction,
          refundAmount,
          refundAmount > 0 ? input.refund_method_code : null,
          input.restock_approved ? 1 : 0,
          reason
        ).lastInsertRowid
    );

    for (const p of prepared) {
      db.prepare(
        'INSERT INTO sales_return_lines (return_id, sale_line_id, base_quantity_milli, amount) VALUES (?, ?, ?, ?)'
      ).run(retId, p.saleLineId, p.baseQtyMilli, p.amount);

      if (input.restock_approved) {
        const prod = db.prepare('SELECT stock_milli FROM products WHERE id = ?').get(p.productId) as {
          stock_milli: number;
        };
        const nextStock = prod.stock_milli + p.baseQtyMilli;
        db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(nextStock, p.productId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
           VALUES (?, 'return_in', ?, ?, ?, ?, ?)`
        ).run(p.productId, p.baseQtyMilli, prod.stock_milli, nextStock, `Retour ${avoRef} : ${reason}`, avoRef);
      }
    }

    if (refundAmount > 0) {
      db.prepare(
        `INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, 'sale_refund', ?, 'out', ?, ?, ?)`
      ).run(
        session.id,
        `ret-ref:${input.request_key}`,
        input.refund_method_code,
        refundAmount,
        `Avoir ${avoRef} sur vente ${sale.reference}`,
        avoRef
      );
    }

    // Mettre à jour le statut de vente
    const remainingQtyRow = db
      .prepare(
        `SELECT COALESCE(SUM(sl.base_quantity_milli), 0) - COALESCE((SELECT SUM(srl.base_quantity_milli) FROM sales_return_lines srl JOIN sales_returns sr ON sr.id = srl.return_id WHERE sr.sale_id = ?), 0) AS rem
         FROM sale_lines sl WHERE sl.sale_id = ?`
      )
      .get(saleId, saleId) as { rem: number };
    db.prepare('UPDATE sales SET status = ? WHERE id = ?').run(
      remainingQtyRow.rem <= 0 ? 'returned' : 'partially_returned',
      saleId
    );

    auditLog(db, 'CREATE_RETURN', 'sales_returns', retId, `Avoir ${avoRef} — ${totalReturnAmount} FCFA`);
    return getSaleDetail(saleId);
  });
}
