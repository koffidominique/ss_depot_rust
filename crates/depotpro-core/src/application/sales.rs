use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Sqlite, Transaction};
use std::collections::HashMap;

use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize, FromRow)]
pub struct ClientSummaryDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub client_type: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub is_active: i64,
    pub credit_policy: Option<String>,
    pub credit_limit: Option<i64>,
    pub payment_terms_days: Option<i64>,
    pub unpaid_balance: i64,
    pub returnable_pieces_due: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateClientInput {
    pub name: String,
    pub client_type: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub credit_policy: String,
    pub credit_limit: Option<i64>,
    pub payment_terms_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCreditPolicyInput {
    pub credit_policy: String,
    pub credit_limit: Option<i64>,
    pub payment_terms_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSaleLineInput {
    pub product_id: i64,
    pub packaging_id: i64,
    pub quantity: String,
    pub discount_amount: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PaymentPartInput {
    pub method_code: String,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateSaleInput {
    pub request_key: String,
    pub client_id: Option<i64>,
    pub sale_type: String,
    pub price_tier: String,
    pub discount_amount: Option<i64>,
    pub notes: Option<String>,
    pub lines: Vec<CreateSaleLineInput>,
    pub payments: Vec<PaymentPartInput>,
    pub due_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CancelSaleInput {
    pub reason: String,
    pub refund_method_code: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct SaleReturnLineInput {
    pub sale_line_id: i64,
    pub base_quantity: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSaleReturnInput {
    pub request_key: String,
    pub reason: String,
    pub restock_approved: bool,
    pub refund_method_code: String,
    pub lines: Vec<SaleReturnLineInput>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SaleLineDto {
    pub id: i64,
    pub sale_id: i64,
    pub product_id: i64,
    pub packaging_id: i64,
    pub product_name: String,
    pub packaging_name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub quantity_milli: i64,
    pub base_quantity_milli: i64,
    pub unit_price: i64,
    pub discount_amount: i64,
    pub line_total: i64,
    pub returned_base_milli: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SaleSummaryDto {
    pub id: i64,
    pub reference: String,
    pub client_id: Option<i64>,
    pub client_name: String,
    pub sale_type: String,
    pub price_tier: String,
    pub subtotal_merchandise: i64,
    pub discount_amount: i64,
    pub total_merchandise: i64,
    pub total_deposit: i64,
    pub total_amount: i64,
    pub paid_amount: i64,
    pub remaining_amount: i64,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SaleDetailDto {
    #[serde(flatten)]
    pub sale: SaleSummaryDto,
    pub lines: Vec<SaleLineDto>,
}

pub(crate) async fn audit_log_tx(
    tx: &mut Transaction<'_, Sqlite>,
    action: &str,
    entity_type: &str,
    entity_id: Option<String>,
    details: &str,
) -> CoreResult<()> {
    sqlx::query(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)",
    )
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn require_open_session_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> CoreResult<(i64, String, i64)> {
    let row: Option<(i64, String, i64)> = sqlx::query_as(
        "SELECT id, reference, opening_cash FROM cash_sessions WHERE status = 'open' LIMIT 1",
    )
    .fetch_optional(&mut **tx)
    .await?;
    row.ok_or_else(|| {
        CoreError::SessionNotOpen(
            "Aucune session de caisse ouverte. Ouvrez la caisse avant d'enregistrer une opération."
                .to_string(),
        )
    })
}

pub(crate) async fn get_theoretical_cash_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_id: i64,
    opening_cash: i64,
) -> CoreResult<i64> {
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
         FROM cash_movements
         WHERE session_id = ? AND method_code = 'cash'",
    )
    .bind(session_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(opening_cash + net)
}

pub async fn list_clients(db: &DepotDb, search: Option<&str>) -> CoreResult<Vec<ClientSummaryDto>> {
    let q = search.map(str::trim).filter(|s| !s.is_empty());
    let pattern = q.map(|s| format!("%{s}%"));
    let rows = match pattern {
        Some(pat) => {
            sqlx::query_as::<_, ClientSummaryDto>(
                "SELECT c.id, c.code, c.name, c.client_type, c.phone, c.address, c.city, c.email, c.contact_person, c.is_active,
                        ccs.policy AS credit_policy, ccs.credit_limit, ccs.payment_terms_days,
                        COALESCE((SELECT SUM(remaining_amount) FROM customer_receivables r WHERE r.client_id = c.id AND r.status IN ('open', 'partial')), 0) AS unpaid_balance,
                        COALESCE((SELECT SUM(balance_pieces) FROM customer_packaging_accounts cpa WHERE cpa.client_id = c.id), 0) AS returnable_pieces_due
                 FROM clients c
                 LEFT JOIN client_credit_settings ccs ON ccs.client_id = c.id
                 WHERE c.name LIKE ? OR c.code LIKE ? OR COALESCE(c.phone, '') LIKE ?
                 ORDER BY c.is_active DESC, c.name ASC",
            )
            .bind(&pat)
            .bind(&pat)
            .bind(&pat)
            .fetch_all(&db.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, ClientSummaryDto>(
                "SELECT c.id, c.code, c.name, c.client_type, c.phone, c.address, c.city, c.email, c.contact_person, c.is_active,
                        ccs.policy AS credit_policy, ccs.credit_limit, ccs.payment_terms_days,
                        COALESCE((SELECT SUM(remaining_amount) FROM customer_receivables r WHERE r.client_id = c.id AND r.status IN ('open', 'partial')), 0) AS unpaid_balance,
                        COALESCE((SELECT SUM(balance_pieces) FROM customer_packaging_accounts cpa WHERE cpa.client_id = c.id), 0) AS returnable_pieces_due
                 FROM clients c
                 LEFT JOIN client_credit_settings ccs ON ccs.client_id = c.id
                 ORDER BY c.is_active DESC, c.name ASC",
            )
            .fetch_all(&db.pool)
            .await?
        }
    };
    Ok(rows)
}

pub async fn create_client(db: &DepotDb, input: CreateClientInput) -> CoreResult<ClientSummaryDto> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(CoreError::Validation("Le nom du client est obligatoire.".to_string()));
    }
    if !matches!(input.client_type.as_str(), "particulier" | "professionnel") {
        return Err(CoreError::Validation("Type de client invalide.".to_string()));
    }
    if !matches!(input.credit_policy.as_str(), "forbidden" | "limited" | "unlimited") {
        return Err(CoreError::Validation("Politique de crédit explicite requise.".to_string()));
    }
    let limit = if input.credit_policy == "limited" {
        let raw = input.credit_limit.ok_or_else(|| {
            CoreError::Validation("Plafond de crédit requis pour la politique limitée.".to_string())
        })?;
        Some(Money::from_non_negative(raw, "Plafond de crédit")?.value())
    } else {
        None
    };
    let terms = input.payment_terms_days.unwrap_or(0);
    if terms < 0 {
        return Err(CoreError::Validation("Délai de paiement invalide.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let code = DepotDb::next_sequence(&mut tx, "CLI").await?;

    let client_id: i64 = sqlx::query(
        "INSERT INTO clients (code, name, client_type, phone, address, city, email, contact_person)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(&name)
    .bind(&input.client_type)
    .bind(input.phone.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.address.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.city.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.email.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.contact_person.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query(
        "INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days)
         VALUES (?, ?, ?, ?)",
    )
    .bind(client_id)
    .bind(&input.credit_policy)
    .bind(limit)
    .bind(terms)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "CREATE_CLIENT",
        "clients",
        Some(client_id.to_string()),
        &format!("{code} — {name} ({})", input.credit_policy),
    )
    .await?;
    tx.commit().await?;

    let clients = list_clients(db, Some(&code)).await?;
    clients
        .into_iter()
        .find(|c| c.id == client_id)
        .ok_or_else(|| CoreError::Internal("Client créé introuvable.".to_string()))
}

pub async fn update_client_credit_policy(
    db: &DepotDb,
    client_id: i64,
    input: UpdateCreditPolicyInput,
) -> CoreResult<()> {
    if !matches!(input.credit_policy.as_str(), "forbidden" | "limited" | "unlimited") {
        return Err(CoreError::Validation("Politique de crédit explicite requise.".to_string()));
    }
    let limit = if input.credit_policy == "limited" {
        let raw = input.credit_limit.ok_or_else(|| {
            CoreError::Validation("Plafond de crédit requis.".to_string())
        })?;
        Some(Money::from_non_negative(raw, "Plafond de crédit")?.value())
    } else {
        None
    };
    let terms = input.payment_terms_days.unwrap_or(0);
    if terms < 0 {
        return Err(CoreError::Validation("Délai de paiement invalide.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM clients WHERE id = ?")
        .bind(client_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(CoreError::Validation("Client introuvable.".to_string()));
    }

    sqlx::query(
        "INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(client_id) DO UPDATE SET
           policy = excluded.policy,
           credit_limit = excluded.credit_limit,
           payment_terms_days = excluded.payment_terms_days,
           updated_at = datetime('now')",
    )
    .bind(client_id)
    .bind(&input.credit_policy)
    .bind(limit)
    .bind(terms)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_CLIENT_CREDIT",
        "clients",
        Some(client_id.to_string()),
        &format!("Politique {}", input.credit_policy),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

struct PreparedSaleLine {
    product_id: i64,
    product_name: String,
    packaging_id: i64,
    packaging_name: String,
    base_unit: String,
    coeff_milli: i64,
    qty_milli: i64,
    base_qty_milli: i64,
    unit_price: i64,
    line_discount: i64,
    line_total: i64,
    cost_num: Option<String>,
    cost_den: Option<String>,
    deposit_items: Vec<(i64, i64, i64, i64)>, // (returnable_id, pieces, unit_value, amount)
}

pub async fn get_sale_detail(db: &DepotDb, sale_id: i64) -> CoreResult<SaleDetailDto> {
    let sale = sqlx::query_as::<_, SaleSummaryDto>(
        "SELECT s.id, s.reference, s.client_id, COALESCE(c.name, 'Client Comptoir') AS client_name,
                s.sale_type, s.price_tier, s.subtotal_merchandise, s.discount_amount,
                s.total_merchandise, s.total_deposit, s.total_amount, s.paid_amount,
                COALESCE(cr.remaining_amount, 0) AS remaining_amount, s.status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
         WHERE s.id = ?",
    )
    .bind(sale_id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::Validation("Vente introuvable.".to_string()))?;

    let lines = sqlx::query_as::<_, SaleLineDto>(
        "SELECT sl.id, sl.sale_id, sl.product_id, sl.packaging_id, sl.product_name, sl.packaging_name,
                sl.base_unit, sl.coefficient_milli, sl.quantity_milli, sl.base_quantity_milli,
                sl.unit_price, sl.discount_amount, sl.line_total,
                COALESCE((SELECT SUM(srl.base_quantity_milli) FROM sales_return_lines srl WHERE srl.sale_line_id = sl.id), 0) AS returned_base_milli
         FROM sale_lines sl
         WHERE sl.sale_id = ?",
    )
    .bind(sale_id)
    .fetch_all(&db.pool)
    .await?;

    Ok(SaleDetailDto { sale, lines })
}

pub async fn list_sales(
    db: &DepotDb,
    search: Option<&str>,
    status: Option<&str>,
    limit: i64,
    offset: i64,
) -> CoreResult<Vec<SaleSummaryDto>> {
    let pat = format!("%{}%", search.unwrap_or("").trim());
    let status_filter = status.filter(|s| *s != "all").unwrap_or("");
    let rows = sqlx::query_as::<_, SaleSummaryDto>(
        "SELECT s.id, s.reference, s.client_id, COALESCE(c.name, 'Client Comptoir') AS client_name,
                s.sale_type, s.price_tier, s.subtotal_merchandise, s.discount_amount,
                s.total_merchandise, s.total_deposit, s.total_amount, s.paid_amount,
                COALESCE(cr.remaining_amount, 0) AS remaining_amount, s.status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
         WHERE (? = '' OR s.status = ?)
           AND (s.reference LIKE ? OR COALESCE(c.name, 'Client Comptoir') LIKE ?)
         ORDER BY s.id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(status_filter)
    .bind(status_filter)
    .bind(&pat)
    .bind(&pat)
    .bind(limit)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_sale(db: &DepotDb, input: CreateSaleInput) -> CoreResult<SaleDetailDto> {
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation("Clé d'idempotence requise.".to_string()));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation("La vente doit comporter au moins une ligne.".to_string()));
    }
    if !matches!(input.sale_type.as_str(), "cash" | "credit") {
        return Err(CoreError::Validation("Type de vente invalide.".to_string()));
    }
    if !matches!(input.price_tier.as_str(), "wholesale" | "semi_wholesale" | "retail") {
        return Err(CoreError::Validation("Grille tarifaire invalide.".to_string()));
    }
    let global_discount = Money::from_non_negative(input.discount_amount.unwrap_or(0), "Remise globale")?;

    let (_guard, mut tx) = db.begin_write().await?;

    if let Some((existing_id,)) = sqlx::query_as::<_, (i64,)>("SELECT id FROM sales WHERE request_key = ?")
        .bind(&request_key)
        .fetch_optional(&mut *tx)
        .await?
    {
        tx.rollback().await?;
        return get_sale_detail(db, existing_id).await;
    }

    let (session_id, _session_ref, _opening_cash) = require_open_session_tx(&mut tx).await?;
    let (allow_neg, sale_prefix): (i64, String) =
        sqlx::query_as("SELECT allow_negative_stock, sale_prefix FROM app_settings WHERE id = 1")
            .fetch_one(&mut *tx)
            .await?;

    let mut client_name = String::new();
    let mut credit_policy: Option<String> = None;
    let mut credit_limit: Option<i64> = None;
    let mut payment_terms_days: i64 = 0;

    if let Some(cid) = input.client_id {
        let c_row: Option<(String, i64)> =
            sqlx::query_as("SELECT name, is_active FROM clients WHERE id = ?")
                .bind(cid)
                .fetch_optional(&mut *tx)
                .await?;
        let (cname, active) = c_row.ok_or_else(|| CoreError::Validation("Client actif introuvable.".to_string()))?;
        if active == 0 {
            return Err(CoreError::Validation("Client archivé : vente impossible.".to_string()));
        }
        client_name = cname;
        let cs: Option<(String, Option<i64>, i64)> = sqlx::query_as(
            "SELECT policy, credit_limit, payment_terms_days FROM client_credit_settings WHERE client_id = ?",
        )
        .bind(cid)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((pol, lim, terms)) = cs {
            credit_policy = Some(pol);
            credit_limit = lim;
            payment_terms_days = terms;
        }
    }

    if input.sale_type == "credit" {
        if input.client_id.is_none() {
            return Err(CoreError::CreditPolicyViolation(
                "Une vente à crédit doit obligatoirement être liée à un client.".to_string(),
            ));
        }
        if credit_policy.as_deref().unwrap_or("forbidden") == "forbidden" {
            return Err(CoreError::CreditPolicyViolation(format!(
                "Le crédit n'est pas autorisé pour le client \"{client_name}\"."
            )));
        }
    }

    let mut prepared_lines: Vec<PreparedSaleLine> = Vec::with_capacity(input.lines.len());
    let mut product_deductions: HashMap<i64, i64> = HashMap::new();
    let mut subtotal_merchandise = Money::ZERO;
    let mut total_deposit = Money::ZERO;

    for line in &input.lines {
        let prod: Option<(i64, String, String, Option<String>, Option<String>, i64)> = sqlx::query_as(
            "SELECT id, name, base_unit, average_cost_num, average_cost_den, is_active FROM products WHERE id = ?",
        )
        .bind(line.product_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (pid, pname, base_unit, cost_num, cost_den, is_active) =
            prod.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;
        if is_active == 0 {
            return Err(CoreError::Validation(format!("Produit \"{pname}\" archivé.")));
        }

        let pkg: Option<(i64, String, i64, Option<i64>, Option<i64>, Option<i64>, i64)> = sqlx::query_as(
            "SELECT id, name, coefficient_milli, wholesale_price, semi_wholesale_price, retail_price, allow_fraction
             FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1",
        )
        .bind(line.packaging_id)
        .bind(pid)
        .fetch_optional(&mut *tx)
        .await?;
        let (pkg_id, pkg_name, coeff_milli, p_whole, p_semi, p_retail, allow_fraction) =
            pkg.ok_or_else(|| CoreError::Validation(format!("Conditionnement invalide pour \"{pname}\".")))?;

        let qty = Quantity::parse_str(&line.quantity, &format!("Quantité ({pname})"))?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(format!("La quantité ({pname}) doit être > 0.")));
        }
        if allow_fraction == 0 && qty.milli_units % 1000 != 0 {
            return Err(CoreError::Validation(format!(
                "Les quantités fractionnaires ne sont pas autorisées pour \"{pname} ({pkg_name})\"."
            )));
        }

        let base_qty = qty.multiply_coefficient_to_base(Quantity::from_milli(coeff_milli))?;
        let raw_price = match input.price_tier.as_str() {
            "wholesale" => p_whole,
            "semi_wholesale" => p_semi,
            _ => p_retail,
        };
        let unit_price = Money::from_non_negative(
            raw_price.ok_or_else(|| {
                CoreError::Validation(format!("Tarif \"{}\" non configuré pour {pname} ({pkg_name}).", input.price_tier))
            })?,
            &format!("Tarif {pname}"),
        )?;

        let gross_line = qty.compute_line_fcfa(unit_price.value())?;
        let line_discount = Money::from_non_negative(line.discount_amount.unwrap_or(0), "Remise ligne")?;
        if line_discount.value() > gross_line {
            return Err(CoreError::Validation(format!("Remise supérieure au montant de la ligne ({pname}).")));
        }
        let line_total = Money(gross_line - line_discount.value());
        subtotal_merchandise = subtotal_merchandise.checked_add(line_total, "Sous-total")?;

        let dep_mode: Option<(String,)> = sqlx::query_as(
            "SELECT mode FROM deposit_packaging_profiles WHERE packaging_id = ?",
        )
        .bind(pkg_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (mode,) = dep_mode.ok_or_else(|| {
            CoreError::Validation(format!(
                "Le profil de consigne de \"{pname} ({pkg_name})\" n'est pas configuré."
            ))
        })?;

        let mut deposit_items = Vec::new();
        if mode == "deposit" {
            if qty.milli_units % 1000 != 0 {
                return Err(CoreError::Validation(format!(
                    "Les emballages consignés exigent des quantités entières ({pname})."
                )));
            }
            let packs = qty.milli_units / 1000;
            let comps: Vec<(i64, i64, i64)> = sqlx::query_as(
                "SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.deposit_value
                 FROM deposit_packaging_components dpc
                 JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?",
            )
            .bind(pkg_id)
            .fetch_all(&mut *tx)
            .await?;
            if comps.is_empty() {
                return Err(CoreError::Validation(format!(
                    "Aucun emballage consigné lié à \"{pname} ({pkg_name})\"."
                )));
            }
            for (rid, ppp, dep_val) in comps {
                let pieces = packs * ppp;
                let amt = Money(pieces * dep_val);
                total_deposit = total_deposit.checked_add(amt, "Total consignes")?;
                deposit_items.push((rid, pieces, dep_val, amt.value()));
            }
        }

        *product_deductions.entry(pid).or_insert(0) += base_qty.milli_units;
        prepared_lines.push(PreparedSaleLine {
            product_id: pid,
            product_name: pname,
            packaging_id: pkg_id,
            packaging_name: pkg_name,
            base_unit,
            coeff_milli,
            qty_milli: qty.milli_units,
            base_qty_milli: base_qty.milli_units,
            unit_price: unit_price.value(),
            line_discount: line_discount.value(),
            line_total: line_total.value(),
            cost_num,
            cost_den,
            deposit_items,
        });
    }

    if global_discount > subtotal_merchandise {
        return Err(CoreError::Validation("La remise globale dépasse le sous-total marchandises.".to_string()));
    }

    for (pid, needed_milli) in &product_deductions {
        let (pname, stock_milli): (String, i64) =
            sqlx::query_as("SELECT name, stock_milli FROM products WHERE id = ?")
                .bind(pid)
                .fetch_one(&mut *tx)
                .await?;
        if allow_neg == 0 && stock_milli < *needed_milli {
            return Err(CoreError::InsufficientStock(format!(
                "Stock insuffisant pour \"{pname}\"."
            )));
        }
    }

    let total_merchandise = subtotal_merchandise.checked_sub(global_discount, "Total marchandises")?;
    let total_amount = total_merchandise.checked_add(total_deposit, "Total vente")?;
    if total_amount.value() <= 0 {
        return Err(CoreError::Validation("Le total de la vente doit être strictement positif.".to_string()));
    }

    let mut normalized_payments: Vec<(String, i64)> = Vec::new();
    let mut paid_amount = Money::ZERO;
    for p in &input.payments {
        let amt = Money::from_positive(p.amount, &format!("Montant ({})", p.method_code))?;
        let pm: Option<(String, i64)> =
            sqlx::query_as("SELECT code, active FROM payment_methods WHERE code = ?")
                .bind(&p.method_code)
                .fetch_optional(&mut *tx)
                .await?;
        let (code, active) = pm.ok_or_else(|| {
            CoreError::InvalidPayment(format!("Moyen de paiement introuvable : {}", p.method_code))
        })?;
        if active == 0 {
            return Err(CoreError::InvalidPayment(format!("Moyen de paiement inactif : {code}")));
        }
        paid_amount = paid_amount.checked_add(amt, "Total encaissé")?;
        normalized_payments.push((code, amt.value()));
    }

    if input.sale_type == "cash" && paid_amount != total_amount {
        return Err(CoreError::InvalidPayment(format!(
            "Une vente au comptant doit être intégralement encaissée (attendu : {}, reçu : {}).",
            total_amount.value(),
            paid_amount.value()
        )));
    }
    if input.sale_type == "credit" && paid_amount >= total_amount {
        return Err(CoreError::InvalidPayment(
            "Pour une vente entièrement payée, utilisez le type comptant.".to_string(),
        ));
    }

    let credit_amount = total_amount.value() - paid_amount.value();
    if input.sale_type == "credit" && credit_policy.as_deref() == Some("limited") {
        let cid = input.client_id.unwrap();
        let current_due: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables WHERE client_id = ? AND status IN ('open', 'partial')",
        )
        .bind(cid)
        .fetch_one(&mut *tx)
        .await?;
        if let Some(lim) = credit_limit {
            if current_due + credit_amount > lim {
                return Err(CoreError::CreditPolicyViolation(format!(
                    "Plafond de crédit dépassé pour \"{client_name}\"."
                )));
            }
        }
    }

    let sale_ref = DepotDb::next_sequence(&mut tx, &sale_prefix).await?;
    let sale_id = sqlx::query(
        "INSERT INTO sales (reference, request_key, client_id, sale_type, price_tier, subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?)",
    )
    .bind(&sale_ref)
    .bind(&request_key)
    .bind(input.client_id)
    .bind(&input.sale_type)
    .bind(&input.price_tier)
    .bind(subtotal_merchandise.value())
    .bind(global_discount.value())
    .bind(total_merchandise.value())
    .bind(total_deposit.value())
    .bind(total_amount.value())
    .bind(paid_amount.value())
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for line in &prepared_lines {
        let line_id = sqlx::query(
            "INSERT INTO sale_lines (sale_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total, cost_num, cost_den)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(sale_id)
        .bind(line.product_id)
        .bind(line.packaging_id)
        .bind(&line.product_name)
        .bind(&line.packaging_name)
        .bind(&line.base_unit)
        .bind(line.coeff_milli)
        .bind(line.qty_milli)
        .bind(line.base_qty_milli)
        .bind(line.unit_price)
        .bind(line.line_discount)
        .bind(line.line_total)
        .bind(&line.cost_num)
        .bind(&line.cost_den)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        let cur_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(line.product_id)
            .fetch_one(&mut *tx)
            .await?;
        let next_stock = cur_stock - line.base_qty_milli;
        sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
            .bind(next_stock)
            .bind(line.product_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
             VALUES (?, 'sale_out', ?, ?, ?, ?, ?)",
        )
        .bind(line.product_id)
        .bind(-line.base_qty_milli)
        .bind(cur_stock)
        .bind(next_stock)
        .bind(format!("Vente {sale_ref} ({})", line.packaging_name))
        .bind(&sale_ref)
        .execute(&mut *tx)
        .await?;

        for (rid, pieces, unit_val, amt) in &line.deposit_items {
            sqlx::query(
                "INSERT INTO deposit_issues (sale_id, sale_line_id, client_id, returnable_id, pieces, unit_value, amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(sale_id)
            .bind(line_id)
            .bind(input.client_id)
            .bind(rid)
            .bind(pieces)
            .bind(unit_val)
            .bind(amt)
            .execute(&mut *tx)
            .await?;

            if let Some(cid) = input.client_id {
                sqlx::query(
                    "INSERT INTO customer_packaging_accounts (client_id, returnable_id, balance_pieces, deposit_held_amount)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(client_id, returnable_id) DO UPDATE SET
                       balance_pieces = balance_pieces + excluded.balance_pieces,
                       deposit_held_amount = deposit_held_amount + excluded.deposit_held_amount",
                )
                .bind(cid)
                .bind(rid)
                .bind(pieces)
                .bind(amt)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    if paid_amount.value() > 0 {
        let pay_ref = DepotDb::next_sequence(&mut tx, "REC").await?;
        let payment_id = sqlx::query(
            "INSERT INTO payments (reference, request_key, sale_id, client_id, payment_kind, total_amount, note)
             VALUES (?, ?, ?, ?, 'sale', ?, ?)",
        )
        .bind(&pay_ref)
        .bind(format!("pay-sale:{request_key}"))
        .bind(sale_id)
        .bind(input.client_id)
        .bind(paid_amount.value())
        .bind(format!("Encaissement vente {sale_ref}"))
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        for (idx, (method_code, amt)) in normalized_payments.iter().enumerate() {
            let part_id = sqlx::query(
                "INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)",
            )
            .bind(payment_id)
            .bind(method_code)
            .bind(amt)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            sqlx::query(
                "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
                 VALUES (?, ?, ?, 'sale', ?, 'in', ?, ?, ?)",
            )
            .bind(session_id)
            .bind(format!("cm-sale:{request_key}:{idx}"))
            .bind(part_id)
            .bind(method_code)
            .bind(amt)
            .bind(format!("Encaissement {sale_ref}"))
            .bind(&sale_ref)
            .execute(&mut *tx)
            .await?;
        }
    }

    if credit_amount > 0 {
        if let Some(cid) = input.client_id {
            let due_date = input.due_date.clone().or_else(|| {
                if payment_terms_days > 0 {
                    Some((chrono::Utc::now() + chrono::Duration::days(payment_terms_days)).format("%Y-%m-%d").to_string())
                } else {
                    None
                }
            });
            sqlx::query(
                "INSERT INTO customer_receivables (sale_id, client_id, initial_amount, remaining_amount, due_date, status)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(sale_id)
            .bind(cid)
            .bind(credit_amount)
            .bind(credit_amount)
            .bind(due_date)
            .bind(if paid_amount.value() > 0 { "partial" } else { "open" })
            .execute(&mut *tx)
            .await?;
        }
    }

    audit_log_tx(
        &mut tx,
        "CREATE_SALE",
        "sales",
        Some(sale_id.to_string()),
        &format!("{sale_ref} — Total {} FCFA", total_amount.value()),
    )
    .await?;
    tx.commit().await?;

    get_sale_detail(db, sale_id).await
}

pub async fn cancel_sale(db: &DepotDb, sale_id: i64, input: CancelSaleInput) -> CoreResult<SaleDetailDto> {
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation("Le motif d'annulation est obligatoire.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let dup: Option<(i64,)> = sqlx::query_as("SELECT id FROM sales_cancellations WHERE request_key = ?")
        .bind(&input.request_key)
        .fetch_optional(&mut *tx)
        .await?;
    if dup.is_some() {
        tx.rollback().await?;
        return get_sale_detail(db, sale_id).await;
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let sale: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, status FROM sales WHERE id = ?")
            .bind(sale_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_id, sale_ref, status) =
        sale.ok_or_else(|| CoreError::Validation("Vente introuvable.".to_string()))?;
    if status == "cancelled" {
        return Err(CoreError::HistoricalImmutable("Cette vente est déjà annulée.".to_string()));
    }
    let ret_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_returns WHERE sale_id = ?")
        .bind(sale_id)
        .fetch_one(&mut *tx)
        .await?;
    if ret_count > 0 {
        return Err(CoreError::HistoricalImmutable(
            "Impossible d'annuler une vente ayant déjà fait l'objet d'un retour partiel.".to_string(),
        ));
    }

    let lines: Vec<(i64, i64)> =
        sqlx::query_as("SELECT product_id, base_quantity_milli FROM sale_lines WHERE sale_id = ?")
            .bind(sale_id)
            .fetch_all(&mut *tx)
            .await?;
    for (pid, qty_milli) in lines {
        let cur_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(pid)
            .fetch_one(&mut *tx)
            .await?;
        let next_stock = cur_stock + qty_milli;
        sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
            .bind(next_stock)
            .bind(pid)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
             VALUES (?, 'sale_cancel_in', ?, ?, ?, ?, ?)",
        )
        .bind(pid)
        .bind(qty_milli)
        .bind(cur_stock)
        .bind(next_stock)
        .bind(format!("Annulation vente {sale_ref} : {reason}"))
        .bind(&sale_ref)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE customer_receivables SET remaining_amount = 0, status = 'cancelled' WHERE sale_id = ?")
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    let deposits: Vec<(Option<i64>, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT client_id, returnable_id, pieces, returned_pieces, amount FROM deposit_issues WHERE sale_id = ?",
    )
    .bind(sale_id)
    .fetch_all(&mut *tx)
    .await?;
    for (cid_opt, rid, pieces, returned_pieces, amount) in deposits {
        if returned_pieces > 0 {
            return Err(CoreError::HistoricalImmutable(
                "Des vides ont déjà été retournés sur cette vente.".to_string(),
            ));
        }
        if let Some(cid) = cid_opt {
            sqlx::query(
                "UPDATE customer_packaging_accounts
                 SET balance_pieces = MAX(0, balance_pieces - ?),
                     deposit_held_amount = MAX(0, deposit_held_amount - ?)
                 WHERE client_id = ? AND returnable_id = ?",
            )
            .bind(pieces)
            .bind(amount)
            .bind(cid)
            .bind(rid)
            .execute(&mut *tx)
            .await?;
        }
    }

    let refunded: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE sale_id = ? AND payment_kind IN ('sale', 'receivable')",
    )
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await?;
    let refund_method = input.refund_method_code.unwrap_or_else(|| "cash".to_string());

    if refunded > 0 {
        if refund_method == "cash" {
            let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
            if refunded > avail {
                return Err(CoreError::InvalidPayment(
                    "Espèces insuffisantes en caisse pour rembourser cette vente.".to_string(),
                ));
            }
        }
        sqlx::query(
            "INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
             VALUES (?, ?, 'sale_refund', ?, 'out', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(format!("cancel-ref:{}", input.request_key))
        .bind(&refund_method)
        .bind(refunded)
        .bind(format!("Annulation {sale_ref} — {reason}"))
        .bind(&sale_ref)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO sales_cancellations (sale_id, session_id, request_key, reason, refund_method_code, refunded_amount)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(sale_id)
    .bind(session_id)
    .bind(&input.request_key)
    .bind(&reason)
    .bind(if refunded > 0 { Some(refund_method) } else { None })
    .bind(refunded)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE sales SET status = 'cancelled' WHERE id = ?")
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "CANCEL_SALE",
        "sales",
        Some(sale_id.to_string()),
        &format!("Annulation {sale_ref} ({reason})"),
    )
    .await?;
    tx.commit().await?;

    get_sale_detail(db, sale_id).await
}

pub async fn create_sale_return(
    db: &DepotDb,
    sale_id: i64,
    input: CreateSaleReturnInput,
) -> CoreResult<SaleDetailDto> {
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation("Le motif du retour est obligatoire.".to_string()));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation("Sélectionnez au moins un article à retourner.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let dup: Option<(i64,)> = sqlx::query_as("SELECT id FROM sales_returns WHERE request_key = ?")
        .bind(&input.request_key)
        .fetch_optional(&mut *tx)
        .await?;
    if dup.is_some() {
        tx.rollback().await?;
        return get_sale_detail(db, sale_id).await;
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let sale: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, status FROM sales WHERE id = ?")
            .bind(sale_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_id, sale_ref, status) =
        sale.ok_or_else(|| CoreError::Validation("Vente introuvable.".to_string()))?;
    if status == "cancelled" {
        return Err(CoreError::HistoricalImmutable("Vente annulée : retour impossible.".to_string()));
    }

    let avo_prefix: String = sqlx::query_scalar("SELECT credit_note_prefix FROM app_settings WHERE id = 1")
        .fetch_one(&mut *tx)
        .await?;

    let mut total_return = Money::ZERO;
    let mut prepared: Vec<(i64, i64, i64, i64)> = Vec::new();

    for l in &input.lines {
        let base_qty = Quantity::parse_str(&l.base_quantity, "Quantité retournée")?;
        if base_qty.milli_units <= 0 {
            return Err(CoreError::Validation("La quantité retournée doit être > 0.".to_string()));
        }
        let sl: Option<(i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, base_quantity_milli, line_total FROM sale_lines WHERE id = ? AND sale_id = ?",
        )
        .bind(l.sale_line_id)
        .bind(sale_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (sl_id, pid, sold_base_milli, line_total) =
            sl.ok_or_else(|| CoreError::Validation("Ligne de vente introuvable.".to_string()))?;

        let prev_ret: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(base_quantity_milli), 0) FROM sales_return_lines WHERE sale_line_id = ?",
        )
        .bind(sl_id)
        .fetch_one(&mut *tx)
        .await?;

        if prev_ret + base_qty.milli_units > sold_base_milli {
            return Err(CoreError::Validation(
                "Quantité retournée supérieure à la quantité vendue restante.".to_string(),
            ));
        }

        let exact_prod = (line_total as i128) * (base_qty.milli_units as i128);
        let denom = sold_base_milli as i128;
        if exact_prod % denom != 0 {
            return Err(CoreError::Validation(
                "La fraction retournée ne correspond pas à un nombre entier de FCFA.".to_string(),
            ));
        }
        let line_amount = i64::try_from(exact_prod / denom)
            .map_err(|_| CoreError::Validation("Débordement montant retour.".to_string()))?;
        total_return = total_return.checked_add(Money(line_amount), "Total retour")?;
        prepared.push((sl_id, pid, base_qty.milli_units, line_amount));
    }

    let mut credit_reduction: i64 = 0;
    let mut refund_amount: i64 = total_return.value();
    let rec: Option<(i64, i64)> = sqlx::query_as(
        "SELECT id, remaining_amount FROM customer_receivables WHERE sale_id = ? AND status IN ('open', 'partial')",
    )
    .bind(sale_id)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some((rec_id, rem)) = rec {
        if rem > 0 {
            credit_reduction = rem.min(total_return.value());
            refund_amount = total_return.value() - credit_reduction;
            let next_rem = rem - credit_reduction;
            sqlx::query("UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?")
                .bind(next_rem)
                .bind(if next_rem == 0 { "paid" } else { "partial" })
                .bind(rec_id)
                .execute(&mut *tx)
                .await?;
        }
    }

    if refund_amount > 0 && input.refund_method_code == "cash" {
        let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
        if refund_amount > avail {
            return Err(CoreError::InvalidPayment(
                "Espèces insuffisantes en caisse pour le remboursement.".to_string(),
            ));
        }
    }

    let ret_ref = DepotDb::next_sequence(&mut tx, "RET").await?;
    let avo_ref = DepotDb::next_sequence(&mut tx, &avo_prefix).await?;

    let ret_id = sqlx::query(
        "INSERT INTO sales_returns (reference, credit_note_ref, request_key, sale_id, session_id, total_amount, credit_reduction, refund_amount, refund_method_code, restock_approved, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&ret_ref)
    .bind(&avo_ref)
    .bind(&input.request_key)
    .bind(sale_id)
    .bind(session_id)
    .bind(total_return.value())
    .bind(credit_reduction)
    .bind(refund_amount)
    .bind(if refund_amount > 0 { Some(&input.refund_method_code) } else { None })
    .bind(if input.restock_approved { 1_i64 } else { 0_i64 })
    .bind(&reason)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for (sl_id, pid, base_qty_milli, amt) in &prepared {
        sqlx::query(
            "INSERT INTO sales_return_lines (return_id, sale_line_id, base_quantity_milli, amount)
             VALUES (?, ?, ?, ?)",
        )
        .bind(ret_id)
        .bind(sl_id)
        .bind(base_qty_milli)
        .bind(amt)
        .execute(&mut *tx)
        .await?;

        if input.restock_approved {
            let cur_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
                .bind(pid)
                .fetch_one(&mut *tx)
                .await?;
            let next_stock = cur_stock + base_qty_milli;
            sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
                .bind(next_stock)
                .bind(pid)
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
                 VALUES (?, 'return_in', ?, ?, ?, ?, ?)",
            )
            .bind(pid)
            .bind(base_qty_milli)
            .bind(cur_stock)
            .bind(next_stock)
            .bind(format!("Retour {avo_ref} : {reason}"))
            .bind(&avo_ref)
            .execute(&mut *tx)
            .await?;
        }
    }

    if refund_amount > 0 {
        sqlx::query(
            "INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
             VALUES (?, ?, 'sale_refund', ?, 'out', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(format!("ret-ref:{}", input.request_key))
        .bind(&input.refund_method_code)
        .bind(refund_amount)
        .bind(format!("Avoir {avo_ref} sur vente {sale_ref}"))
        .bind(&avo_ref)
        .execute(&mut *tx)
        .await?;
    }

    let remaining_qty: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(sl.base_quantity_milli), 0) - COALESCE((SELECT SUM(srl.base_quantity_milli) FROM sales_return_lines srl JOIN sales_returns sr ON sr.id = srl.return_id WHERE sr.sale_id = ?), 0)
         FROM sale_lines sl WHERE sl.sale_id = ?",
    )
    .bind(sale_id)
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("UPDATE sales SET status = ? WHERE id = ?")
        .bind(if remaining_qty <= 0 { "returned" } else { "partially_returned" })
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "CREATE_RETURN",
        "sales_returns",
        Some(ret_id.to_string()),
        &format!("Avoir {avo_ref} — {} FCFA", total_return.value()),
    )
    .await?;
    tx.commit().await?;

    get_sale_detail(db, sale_id).await
}
