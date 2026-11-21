// ============================================================================
// Référentiel fournisseurs : liste, création et mise à jour
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{CreateSupplierInput, SupplierSummaryDto, UpdateSupplierInput};

pub async fn list_suppliers(
    db: &DepotDb,
    search: Option<&str>,
) -> CoreResult<Vec<SupplierSummaryDto>> {
    require_current_actor_permission(Permission::PurchasesRead)?;
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

pub async fn create_supplier(
    db: &DepotDb,
    input: CreateSupplierInput,
) -> CoreResult<SupplierSummaryDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    let name = input.name.trim().to_string();
    let phone = input.phone.trim().to_string();
    if name.is_empty() || phone.is_empty() {
        return Err(CoreError::Validation(
            "Nom et téléphone fournisseur obligatoires.".to_string(),
        ));
    }
    let terms = input.payment_terms_days.unwrap_or(0);
    if terms < 0 {
        return Err(CoreError::Validation(
            "Délai de paiement invalide.".to_string(),
        ));
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

    audit_log_tx(
        &mut tx,
        "CREATE_SUPPLIER",
        "suppliers",
        Some(sup_id.to_string()),
        &format!("{code} — {name}"),
    )
    .await?;
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
    require_current_actor_permission(Permission::PurchasesWrite)?;
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

    let (
        code,
        prev_name,
        prev_company,
        prev_phone,
        prev_address,
        prev_email,
        prev_contact,
        prev_terms,
        prev_active,
    ) = existing.ok_or_else(|| CoreError::Validation("Fournisseur introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation(
                    "Nom fournisseur obligatoire.".to_string(),
                ));
            }
            clean
        }
        None => prev_name,
    };
    let phone = match input.phone {
        Some(p) => {
            let clean = p.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation(
                    "Téléphone fournisseur obligatoire.".to_string(),
                ));
            }
            clean
        }
        None => prev_phone,
    };
    let terms = input.payment_terms_days.unwrap_or(prev_terms);
    if terms < 0 {
        return Err(CoreError::Validation(
            "Délai de paiement invalide.".to_string(),
        ));
    }

    let opt_text = |opt: Option<Option<String>>, prev: Option<String>| -> Option<String> {
        match opt {
            None => prev,
            Some(None) => None,
            Some(Some(s)) => {
                let t = s.trim().to_string();
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
        }
    };

    let company_name = opt_text(input.company_name, prev_company);
    let address = opt_text(input.address, prev_address);
    let email = opt_text(input.email, prev_email);
    let contact_person = opt_text(input.contact_person, prev_contact);
    let is_active = match input.is_active {
        Some(v) => {
            if v {
                1
            } else {
                0
            }
        }
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
        .ok_or_else(|| {
            CoreError::Internal("Fournisseur introuvable après mise à jour.".to_string())
        })
}
