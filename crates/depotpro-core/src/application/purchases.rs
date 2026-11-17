use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashSet;

use crate::application::products::deserialize_nullable_opt;
use crate::application::sales::{audit_log_tx, get_theoretical_cash_tx, require_open_session_tx};
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierSummaryDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub address: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub payment_terms_days: i64,
    pub is_active: i64,
    pub total_purchases: i64,
    pub balance_due: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PurchaseOrderLineDto {
    pub id: i64,
    pub product_id: i64,
    pub packaging_id: i64,
    pub product_name: String,
    pub packaging_name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub ordered_quantity_milli: i64,
    pub received_quantity_milli: i64,
    pub unit_price: i64,
    pub line_total: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct PurchaseOrderRow {
    pub id: i64,
    pub reference: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub status: String,
    pub total_amount: i64,
    pub received_amount: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct PurchaseOrderDto {
    pub id: i64,
    pub reference: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub status: String,
    pub total_amount: i64,
    pub received_amount: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub lines: Vec<PurchaseOrderLineDto>,
    pub receipts: Vec<PurchaseReceiptDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PurchaseReceiptDto {
    pub id: i64,
    pub reference: String,
    pub purchase_order_id: i64,
    pub total_amount: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierDebtDto {
    pub id: i64,
    pub receipt_id: i64,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub receipt_reference: String,
    pub order_reference: String,
    pub initial_amount: i64,
    pub remaining_amount: i64,
    pub due_date: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupplierInput {
    pub name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub address: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub payment_terms_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSupplierInput {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub company_name: Option<Option<String>>,
    pub phone: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub address: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub email: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub contact_person: Option<Option<String>>,
    pub payment_terms_days: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseOrderLineInput {
    pub product_id: i64,
    pub packaging_id: i64,
    pub quantity: String,
    pub unit_price: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePurchaseOrderInput {
    pub request_key: String,
    pub supplier_id: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub lines: Vec<PurchaseOrderLineInput>,
}

#[derive(Debug, Deserialize)]
pub struct ReceiveLineInput {
    pub purchase_order_line_id: i64,
    pub received_quantity: String,
    pub discrepancy_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReceivePurchaseOrderInput {
    pub request_key: String,
    pub notes: Option<String>,
    pub lines: Vec<ReceiveLineInput>,
}

#[derive(Debug, Deserialize)]
pub struct CancelPurchaseOrderInput {
    pub reason: String,
}

#[derive(Debug, Deserialize)]
pub struct PaySupplierDebtInput {
    pub method_code: String,
    pub amount: i64,
    pub request_key: String,
    pub note: Option<String>,
}

pub async fn list_suppliers(db: &DepotDb, search: Option<&str>) -> CoreResult<Vec<SupplierSummaryDto>> {
    let q = search.map(str::trim).filter(|s| !s.is_empty());
    let rows = match q {
        Some(s) => {
            let pat = format!("%{s}%");
            sqlx::query_as::<_, SupplierSummaryDto>(
                "SELECT s.id, s.code, s.name, s.company_name, s.phone, s.address, s.email, s.contact_person, s.payment_terms_days, s.is_active,
                        COALESCE((SELECT SUM(initial_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id), 0) AS total_purchases,
                        COALESCE((SELECT SUM(remaining_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id AND sd.status IN ('open', 'partial')), 0) AS balance_due
                 FROM suppliers s
                 WHERE s.name LIKE ? OR s.code LIKE ? OR s.phone LIKE ?
                 ORDER BY s.is_active DESC, s.name ASC",
            )
            .bind(&pat)
            .bind(&pat)
            .bind(&pat)
            .fetch_all(&db.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, SupplierSummaryDto>(
                "SELECT s.id, s.code, s.name, s.company_name, s.phone, s.address, s.email, s.contact_person, s.payment_terms_days, s.is_active,
                        COALESCE((SELECT SUM(initial_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id), 0) AS total_purchases,
                        COALESCE((SELECT SUM(remaining_amount) FROM supplier_debts sd WHERE sd.supplier_id = s.id AND sd.status IN ('open', 'partial')), 0) AS balance_due
                 FROM suppliers s
                 ORDER BY s.is_active DESC, s.name ASC",
            )
            .fetch_all(&db.pool)
            .await?
        }
    };
    Ok(rows)
}

pub async fn create_supplier(db: &DepotDb, input: CreateSupplierInput) -> CoreResult<SupplierSummaryDto> {
    let name = input.name.trim().to_string();
    let phone = input.phone.trim().to_string();
    if name.is_empty() || phone.is_empty() {
        return Err(CoreError::Validation("Nom et téléphone fournisseur obligatoires.".to_string()));
    }
    let terms = input.payment_terms_days.unwrap_or(0);
    if terms < 0 {
        return Err(CoreError::Validation("Délai de paiement invalide.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let code = DepotDb::next_sequence(&mut tx, "FRN").await?;
    let sup_id = sqlx::query(
        "INSERT INTO suppliers (code, name, company_name, phone, address, email, contact_person, payment_terms_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(&name)
    .bind(input.company_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&phone)
    .bind(input.address.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.email.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.contact_person.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(terms)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    audit_log_tx(&mut tx, "CREATE_SUPPLIER", "suppliers", Some(sup_id.to_string()), &format!("{code} — {name}")).await?;
    tx.commit().await?;

    list_suppliers(db, Some(&code))
        .await?
        .into_iter()
        .find(|s| s.id == sup_id)
        .ok_or_else(|| CoreError::Internal("Fournisseur créé introuvable.".to_string()))
}

pub async fn update_supplier(
    db: &DepotDb,
    supplier_id: i64,
    input: UpdateSupplierInput,
) -> CoreResult<SupplierSummaryDto> {
    type ExistingSupplierRow = (
        String,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        i64,
    );
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ExistingSupplierRow> = sqlx::query_as(
        "SELECT code, name, company_name, phone, address, email, contact_person, payment_terms_days, is_active
         FROM suppliers WHERE id = ?",
    )
    .bind(supplier_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (code, prev_name, prev_company, prev_phone, prev_address, prev_email, prev_contact, prev_terms, prev_active) =
        existing.ok_or_else(|| CoreError::Validation("Fournisseur introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation("Nom fournisseur obligatoire.".to_string()));
            }
            clean
        }
        None => prev_name,
    };
    let phone = match input.phone {
        Some(p) => {
            let clean = p.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation("Téléphone fournisseur obligatoire.".to_string()));
            }
            clean
        }
        None => prev_phone,
    };
    let terms = input.payment_terms_days.unwrap_or(prev_terms);
    if terms < 0 {
        return Err(CoreError::Validation("Délai de paiement invalide.".to_string()));
    }

    let opt_text = |opt: Option<Option<String>>, prev: Option<String>| -> Option<String> {
        match opt {
            None => prev,
            Some(None) => None,
            Some(Some(s)) => {
                let t = s.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            }
        }
    };

    let company_name = opt_text(input.company_name, prev_company);
    let address = opt_text(input.address, prev_address);
    let email = opt_text(input.email, prev_email);
    let contact_person = opt_text(input.contact_person, prev_contact);
    let is_active = match input.is_active {
        Some(v) => if v { 1 } else { 0 },
        None => prev_active,
    };

    sqlx::query(
        "UPDATE suppliers
         SET name = ?, company_name = ?, phone = ?, address = ?, email = ?, contact_person = ?, payment_terms_days = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(&company_name)
    .bind(&phone)
    .bind(&address)
    .bind(&email)
    .bind(&contact_person)
    .bind(terms)
    .bind(is_active)
    .bind(supplier_id)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_SUPPLIER",
        "suppliers",
        Some(supplier_id.to_string()),
        &format!("{code} — {name}"),
    )
    .await?;
    tx.commit().await?;

    list_suppliers(db, Some(&code))
        .await?
        .into_iter()
        .find(|s| s.id == supplier_id)
        .ok_or_else(|| CoreError::Internal("Fournisseur introuvable après mise à jour.".to_string()))
}

pub async fn list_purchase_orders(db: &DepotDb) -> CoreResult<Vec<PurchaseOrderDto>> {
    let rows = sqlx::query_as::<_, PurchaseOrderRow>(
        "SELECT po.id, po.reference, po.supplier_id, s.name AS supplier_name, s.code AS supplier_code,
                po.status, po.total_amount, po.received_amount, po.expected_date, po.notes, po.created_at
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         ORDER BY po.id DESC",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for po in rows {
        let lines = sqlx::query_as::<_, PurchaseOrderLineDto>(
            "SELECT id, product_id, packaging_id, product_name, packaging_name, base_unit,
                    coefficient_milli, ordered_quantity_milli, received_quantity_milli, unit_price, line_total
             FROM purchase_order_lines
             WHERE purchase_order_id = ?
             ORDER BY id ASC",
        )
        .bind(po.id)
        .fetch_all(&db.pool)
        .await?;

        let receipts = sqlx::query_as::<_, PurchaseReceiptDto>(
            "SELECT id, reference, purchase_order_id, total_amount, notes, created_at
             FROM purchase_receipts
             WHERE purchase_order_id = ?
             ORDER BY id DESC",
        )
        .bind(po.id)
        .fetch_all(&db.pool)
        .await?;

        result.push(PurchaseOrderDto {
            id: po.id,
            reference: po.reference,
            supplier_id: po.supplier_id,
            supplier_name: po.supplier_name,
            supplier_code: po.supplier_code,
            status: po.status,
            total_amount: po.total_amount,
            received_amount: po.received_amount,
            expected_date: po.expected_date,
            notes: po.notes,
            created_at: po.created_at,
            lines,
            receipts,
        });
    }
    Ok(result)
}

pub async fn create_purchase_order(db: &DepotDb, input: CreatePurchaseOrderInput) -> CoreResult<PurchaseOrderDto> {
    if input.request_key.trim().is_empty() {
        return Err(CoreError::Validation("Clé d'idempotence requise.".to_string()));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation("Ajoutez au moins une ligne de commande.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some((existing_id,)) =
        sqlx::query_as::<_, (i64,)>("SELECT id FROM purchase_orders WHERE request_key = ?")
            .bind(&input.request_key)
            .fetch_optional(&mut *tx)
            .await?
    {
        tx.rollback().await?;
        return list_purchase_orders(db)
            .await?
            .into_iter()
            .find(|o| o.id == existing_id)
            .ok_or_else(|| CoreError::Internal("Commande introuvable.".to_string()));
    }

    let sup: Option<(i64,)> = sqlx::query_as("SELECT id FROM suppliers WHERE id = ?")
        .bind(input.supplier_id)
        .fetch_optional(&mut *tx)
        .await?;
    if sup.is_none() {
        return Err(CoreError::Validation("Fournisseur introuvable.".to_string()));
    }

    type PreparedPurchaseOrderLine = (i64, i64, String, String, String, i64, i64, i64, i64);
    let mut total_amount = Money::ZERO;
    let mut prepared: Vec<PreparedPurchaseOrderLine> = Vec::new();

    for l in &input.lines {
        let prod: Option<(i64, String, String)> =
            sqlx::query_as("SELECT id, name, base_unit FROM products WHERE id = ?")
                .bind(l.product_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (pid, pname, base_unit) =
            prod.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

        let pkg: Option<(i64, String, i64)> = sqlx::query_as(
            "SELECT id, name, coefficient_milli FROM product_packagings WHERE id = ? AND product_id = ?",
        )
        .bind(l.packaging_id)
        .bind(pid)
        .fetch_optional(&mut *tx)
        .await?;
        let (pkg_id, pkg_name, coeff_milli) =
            pkg.ok_or_else(|| CoreError::Validation("Conditionnement introuvable.".to_string()))?;

        let qty = Quantity::parse_str(&l.quantity, &format!("Quantité commandée ({pname})"))?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation("La quantité commandée doit être > 0.".to_string()));
        }
        let unit_price = Money::from_non_negative(l.unit_price, &format!("Prix achat ({pname})"))?;
        let line_total = Money(qty.compute_line_fcfa(unit_price.value())?);
        total_amount = total_amount.checked_add(line_total, "Total commande")?;

        prepared.push((
            pid,
            pkg_id,
            pname,
            pkg_name,
            base_unit,
            coeff_milli,
            qty.milli_units,
            unit_price.value(),
            line_total.value(),
        ));
    }

    let reference = DepotDb::next_sequence(&mut tx, "CMD").await?;
    let po_id = sqlx::query(
        "INSERT INTO purchase_orders (reference, request_key, supplier_id, status, total_amount, expected_date, notes)
         VALUES (?, ?, ?, 'confirmed', ?, ?, ?)",
    )
    .bind(&reference)
    .bind(&input.request_key)
    .bind(input.supplier_id)
    .bind(total_amount.value())
    .bind(input.expected_date.as_deref())
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for p in prepared {
        sqlx::query(
            "INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(po_id)
        .bind(p.0)
        .bind(p.1)
        .bind(&p.2)
        .bind(&p.3)
        .bind(&p.4)
        .bind(p.5)
        .bind(p.6)
        .bind(p.7)
        .bind(p.8)
        .execute(&mut *tx)
        .await?;
    }

    // Un bon de commande ne modifie PAS le stock avant réception.
    audit_log_tx(
        &mut tx,
        "CREATE_PO",
        "purchase_orders",
        Some(po_id.to_string()),
        &format!("Commande {reference} — {} FCFA", total_amount.value()),
    )
    .await?;
    tx.commit().await?;

    list_purchase_orders(db)
        .await?
        .into_iter()
        .find(|o| o.id == po_id)
        .ok_or_else(|| CoreError::Internal("Commande créée introuvable.".to_string()))
}

pub async fn receive_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: ReceivePurchaseOrderInput,
) -> CoreResult<PurchaseReceiptDto> {
    if purchase_order_id <= 0 {
        return Err(CoreError::Validation(
            "Identifiant de bon de commande invalide.".to_string(),
        ));
    }
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "Saisissez au moins une ligne reçue.".to_string(),
        ));
    }

    let mut seen_po_lines: HashSet<i64> = HashSet::with_capacity(input.lines.len());
    let mut normalized_lines: Vec<(i64, Quantity, Option<String>)> =
        Vec::with_capacity(input.lines.len());
    for l in &input.lines {
        if l.purchase_order_line_id <= 0 {
            return Err(CoreError::Validation(
                "Identifiant de ligne de commande invalide.".to_string(),
            ));
        }
        if !seen_po_lines.insert(l.purchase_order_line_id) {
            return Err(CoreError::Validation(format!(
                "Ligne de commande #{} dupliquée dans la même demande de réception. Regroupez les quantités sur une seule ligne.",
                l.purchase_order_line_id
            )));
        }
        let qty = Quantity::parse_str(&l.received_quantity, "Quantité réceptionnée")?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(
                "La quantité reçue doit être > 0.".to_string(),
            ));
        }
        let disc_reason = l
            .discrepancy_reason
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        normalized_lines.push((l.purchase_order_line_id, qty, disc_reason));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some(existing) = sqlx::query_as::<_, PurchaseReceiptDto>(
        "SELECT id, reference, purchase_order_id, total_amount, notes, created_at FROM purchase_receipts WHERE request_key = ?",
    )
    .bind(&request_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.rollback().await?;
        if existing.purchase_order_id != purchase_order_id {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour un autre bon de commande."
                    .to_string(),
            ));
        }
        return Ok(existing);
    }

    let po: Option<(i64, String, i64, String)> = sqlx::query_as(
        "SELECT id, reference, supplier_id, status FROM purchase_orders WHERE id = ?",
    )
    .bind(purchase_order_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (_po_id, po_ref, supplier_id, po_status) =
        po.ok_or_else(|| CoreError::Validation("Bon de commande introuvable.".to_string()))?;
    if matches!(po_status.as_str(), "cancelled" | "received") {
        return Err(CoreError::HistoricalImmutable(
            "Ce bon de commande est déjà clôturé ou annulé.".to_string(),
        ));
    }

    let payment_terms_days: i64 =
        sqlx::query_scalar("SELECT payment_terms_days FROM suppliers WHERE id = ?")
            .bind(supplier_id)
            .fetch_one(&mut *tx)
            .await?;

    type PreparedReceiptLine = (i64, i64, i64, i64, i64, i64, Option<String>);
    let mut receipt_total = Money::ZERO;
    let mut prepared: Vec<PreparedReceiptLine> =
        Vec::with_capacity(normalized_lines.len());

    for (po_line_id, qty, disc_reason) in &normalized_lines {
        let pol: Option<(i64, i64, i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, coefficient_milli, ordered_quantity_milli, received_quantity_milli, unit_price
             FROM purchase_order_lines WHERE id = ? AND purchase_order_id = ?",
        )
        .bind(po_line_id)
        .bind(purchase_order_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (pol_id, pid, coeff_milli, ordered_milli, received_milli, unit_price) =
            pol.ok_or_else(|| CoreError::Validation("Ligne de commande introuvable.".to_string()))?;

        if received_milli >= ordered_milli {
            return Err(CoreError::Validation(format!(
                "La ligne de commande #{pol_id} a déjà été intégralement réceptionnée."
            )));
        }
        if received_milli + qty.milli_units > ordered_milli {
            return Err(CoreError::Validation(
                "La quantité reçue dépasse la quantité commandée restante.".to_string(),
            ));
        }
        let base_qty = qty.multiply_coefficient_to_base(Quantity::from_milli(coeff_milli))?;
        let amount = Money(qty.compute_line_fcfa(unit_price)?);
        receipt_total = receipt_total.checked_add(amount, "Total réception")?;
        prepared.push((
            pol_id,
            pid,
            qty.milli_units,
            base_qty.milli_units,
            unit_price,
            amount.value(),
            disc_reason.clone(),
        ));
    }

    let rec_ref = DepotDb::next_sequence(&mut tx, "REC").await?;
    let receipt_id = sqlx::query(
        "INSERT INTO purchase_receipts (reference, request_key, purchase_order_id, total_amount, notes)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&rec_ref)
    .bind(&request_key)
    .bind(purchase_order_id)
    .bind(receipt_total.value())
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for (pol_id, pid, qty_milli, base_qty_milli, unit_price, amount, disc_reason) in &prepared {
        let updated = sqlx::query(
            "UPDATE purchase_order_lines
             SET received_quantity_milli = received_quantity_milli + ?
             WHERE id = ? AND purchase_order_id = ? AND received_quantity_milli + ? <= ordered_quantity_milli",
        )
        .bind(qty_milli)
        .bind(pol_id)
        .bind(purchase_order_id)
        .bind(qty_milli)
        .execute(&mut *tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(CoreError::Validation(
                "La quantité reçue dépasse la quantité commandée restante.".to_string(),
            ));
        }

        sqlx::query(
            "INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_line_id, quantity_milli, base_quantity_milli, unit_price, amount, discrepancy_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(receipt_id)
        .bind(pol_id)
        .bind(qty_milli)
        .bind(base_qty_milli)
        .bind(unit_price)
        .bind(amount)
        .bind(disc_reason.as_deref())
        .execute(&mut *tx)
        .await?;

        let (cur_stock, avg_num, avg_den): (i64, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT stock_milli, average_cost_num, average_cost_den FROM products WHERE id = ?",
        )
        .bind(pid)
        .fetch_one(&mut *tx)
        .await?;

        let next_stock = cur_stock + base_qty_milli;
        let mut next_num = avg_num.clone();
        let mut next_den = avg_den.clone();

        if *amount >= 0 && *base_qty_milli > 0 && (cur_stock == 0 || (avg_num.is_some() && avg_den.is_some())) {
            let old_num: i128 = avg_num.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0);
            let old_den: i128 = avg_den.as_deref().and_then(|s| s.parse().ok()).unwrap_or(1).max(1);
            let old_val_scaled = ((cur_stock as i128) * old_num) / old_den;
            let added_val_scaled = (*amount as i128) * 1000_i128;
            let total_num = old_val_scaled + added_val_scaled;
            let total_den = next_stock as i128;
            if total_den > 0 {
                next_num = Some(total_num.to_string());
                next_den = Some(total_den.to_string());
            }
        }

        sqlx::query("UPDATE products SET stock_milli = ?, average_cost_num = ?, average_cost_den = ? WHERE id = ?")
            .bind(next_stock)
            .bind(&next_num)
            .bind(&next_den)
            .bind(pid)
            .execute(&mut *tx)
            .await?;

        let unit_base_cost = if *base_qty_milli > 0 {
            Some(((*amount as i128 * 1000) / (*base_qty_milli as i128)) as i64)
        } else {
            None
        };

        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
             VALUES (?, 'purchase_in', ?, ?, ?, ?, ?, ?)",
        )
        .bind(pid)
        .bind(base_qty_milli)
        .bind(cur_stock)
        .bind(next_stock)
        .bind(unit_base_cost)
        .bind(format!("Réception {rec_ref} (CMD {po_ref})"))
        .bind(&rec_ref)
        .execute(&mut *tx)
        .await?;
    }

    let due_date = if payment_terms_days > 0 {
        Some((chrono::Utc::now() + chrono::Duration::days(payment_terms_days)).format("%Y-%m-%d").to_string())
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO supplier_debts (receipt_id, supplier_id, initial_amount, remaining_amount, due_date, status)
         VALUES (?, ?, ?, ?, ?, 'open')",
    )
    .bind(receipt_id)
    .bind(supplier_id)
    .bind(receipt_total.value())
    .bind(receipt_total.value())
    .bind(due_date)
    .execute(&mut *tx)
    .await?;

    let rem: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(ordered_quantity_milli - received_quantity_milli), 0) FROM purchase_order_lines WHERE purchase_order_id = ?",
    )
    .bind(purchase_order_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("UPDATE purchase_orders SET received_amount = received_amount + ?, status = ? WHERE id = ?")
        .bind(receipt_total.value())
        .bind(if rem == 0 { "received" } else { "partial" })
        .bind(purchase_order_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "RECEIVE_PO",
        "purchase_receipts",
        Some(receipt_id.to_string()),
        &format!("Réception {rec_ref} sur {po_ref} — {} FCFA", receipt_total.value()),
    )
    .await?;
    tx.commit().await?;

    let rec = sqlx::query_as::<_, PurchaseReceiptDto>(
        "SELECT id, reference, purchase_order_id, total_amount, notes, created_at FROM purchase_receipts WHERE id = ?",
    )
    .bind(receipt_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(rec)
}

pub async fn cancel_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: CancelPurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    if purchase_order_id <= 0 {
        return Err(CoreError::Validation("Bon de commande invalide.".to_string()));
    }
    let reason = input.reason.trim();
    if reason.is_empty() {
        return Err(CoreError::Validation("Le motif d'annulation est obligatoire.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let po: Option<(String, String, i64, Option<String>)> = sqlx::query_as(
        "SELECT reference, status, received_amount, notes FROM purchase_orders WHERE id = ?",
    )
    .bind(purchase_order_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (po_ref, status, received_amount, prev_notes) =
        po.ok_or_else(|| CoreError::Validation("Bon de commande introuvable.".to_string()))?;

    if status == "cancelled" {
        return Err(CoreError::HistoricalImmutable(
            "Ce bon de commande est déjà annulé.".to_string(),
        ));
    }
    let receipt_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM purchase_receipts WHERE purchase_order_id = ?")
            .bind(purchase_order_id)
            .fetch_one(&mut *tx)
            .await?;

    if status == "partial" || status == "received" || received_amount > 0 || receipt_count > 0 {
        return Err(CoreError::HistoricalImmutable(
            "Impossible d'annuler un bon de commande ayant déjà fait l'objet d'une réception."
                .to_string(),
        ));
    }

    let next_notes = match prev_notes {
        Some(n) if !n.trim().is_empty() => format!("{n} · [Annulé : {reason}]"),
        _ => format!("[Annulé : {reason}]"),
    };

    sqlx::query("UPDATE purchase_orders SET status = 'cancelled', notes = ? WHERE id = ?")
        .bind(&next_notes)
        .bind(purchase_order_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "CANCEL_PURCHASE_ORDER",
        "purchase_orders",
        Some(purchase_order_id.to_string()),
        &format!("Annulation {po_ref} — {reason}"),
    )
    .await?;
    tx.commit().await?;

    list_purchase_orders(db)
        .await?
        .into_iter()
        .find(|o| o.id == purchase_order_id)
        .ok_or_else(|| CoreError::Internal("Bon de commande introuvable après annulation.".to_string()))
}

pub async fn list_supplier_debts(db: &DepotDb) -> CoreResult<Vec<SupplierDebtDto>> {
    let rows = sqlx::query_as::<_, SupplierDebtDto>(
        "SELECT sd.id, sd.receipt_id, sd.supplier_id, s.name AS supplier_name, s.code AS supplier_code,
                pr.reference AS receipt_reference, po.reference AS order_reference,
                sd.initial_amount, sd.remaining_amount, sd.due_date, sd.status, sd.created_at
         FROM supplier_debts sd
         JOIN suppliers s ON s.id = sd.supplier_id
         JOIN purchase_receipts pr ON pr.id = sd.receipt_id
         JOIN purchase_orders po ON po.id = pr.purchase_order_id
         ORDER BY sd.status ASC, sd.id DESC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn pay_supplier_debt(
    db: &DepotDb,
    debt_id: i64,
    input: PaySupplierDebtInput,
) -> CoreResult<()> {
    let amount = Money::from_positive(input.amount, "Montant règlement fournisseur")?;
    let (_guard, mut tx) = db.begin_write().await?;

    if sqlx::query_scalar::<_, i64>("SELECT id FROM payments WHERE request_key = ?")
        .bind(&input.request_key)
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        tx.rollback().await?;
        return Ok(());
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let debt: Option<(i64, i64)> =
        sqlx::query_as("SELECT id, remaining_amount FROM supplier_debts WHERE id = ?")
            .bind(debt_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_id, rem) = debt.ok_or_else(|| CoreError::Validation("Dette fournisseur introuvable.".to_string()))?;
    if amount.value() > rem {
        return Err(CoreError::InvalidPayment(
            "Le règlement dépasse le solde fournisseur restant.".to_string(),
        ));
    }

    let pm: Option<(String, i64, i64)> =
        sqlx::query_as("SELECT code, is_cash, active FROM payment_methods WHERE code = ?")
            .bind(&input.method_code)
            .fetch_optional(&mut *tx)
            .await?;
    let (pm_code, is_cash, active) =
        pm.ok_or_else(|| CoreError::InvalidPayment("Moyen de paiement invalide.".to_string()))?;
    if active == 0 {
        return Err(CoreError::InvalidPayment("Moyen de paiement inactif.".to_string()));
    }

    if is_cash == 1 {
        let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
        if amount.value() > avail {
            return Err(CoreError::InvalidPayment(
                "Espèces insuffisantes en caisse pour ce règlement fournisseur.".to_string(),
            ));
        }
    }

    let pay_ref = DepotDb::next_sequence(&mut tx, "REC").await?;
    let payment_id = sqlx::query(
        "INSERT INTO payments (reference, request_key, payment_kind, total_amount, note)
         VALUES (?, ?, 'supplier_debt', ?, ?)",
    )
    .bind(&pay_ref)
    .bind(&input.request_key)
    .bind(amount.value())
    .bind(input.note.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    let part_id = sqlx::query("INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)")
        .bind(payment_id)
        .bind(&pm_code)
        .bind(amount.value())
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

    sqlx::query(
        "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, ?, 'supplier_payment', ?, 'out', ?, ?, ?)",
    )
    .bind(session_id)
    .bind(format!("cm-sup:{}", input.request_key))
    .bind(part_id)
    .bind(&pm_code)
    .bind(amount.value())
    .bind(format!("Règlement fournisseur dette #{debt_id}"))
    .bind(&pay_ref)
    .execute(&mut *tx)
    .await?;

    let next_rem = rem - amount.value();
    sqlx::query("UPDATE supplier_debts SET remaining_amount = ?, status = ? WHERE id = ?")
        .bind(next_rem)
        .bind(if next_rem == 0 { "paid" } else { "partial" })
        .bind(debt_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "PAY_SUPPLIER_DEBT",
        "supplier_debts",
        Some(debt_id.to_string()),
        &format!("{pay_ref} — {} FCFA", amount.value()),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}
