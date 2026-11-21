// ============================================================================
// Création transactionnelle d'une vente (orchestration et contrôles)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_helpers::{normalize_sale_payments_tx, prepare_sale_lines_tx};
use super::create_persistence::{
    persist_sale_lines_and_deposits_tx, persist_sale_payments_and_receivable_tx, SalePersistCtx,
};
use super::{
    audit_log_tx, get_sale_detail, require_open_session_tx, CreateSaleInput, CreateSaleLineV4Input,
    CreateSaleV4Input, SaleDetailDto,
};

pub async fn create_sale(db: &DepotDb, input: CreateSaleInput) -> CoreResult<SaleDetailDto> {
    let v4 = CreateSaleV4Input {
        request_key: input.request_key,
        client_id: input.client_id,
        sale_type: input.sale_type,
        price_tier: input.price_tier,
        discount_amount: input.discount_amount,
        notes: input.notes,
        lines: input
            .lines
            .into_iter()
            .map(|l| CreateSaleLineV4Input {
                product_id: l.product_id,
                packaging_id: l.packaging_id,
                sales_unit_id: None,
                quantity: l.quantity,
                discount_amount: l.discount_amount,
            })
            .collect(),
        payments: input.payments,
        due_date: input.due_date,
    };
    create_sale_v4(db, v4).await
}

pub async fn create_sale_v4(db: &DepotDb, input: CreateSaleV4Input) -> CoreResult<SaleDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "La vente doit comporter au moins une ligne.".to_string(),
        ));
    }
    if !matches!(input.sale_type.as_str(), "cash" | "credit") {
        return Err(CoreError::Validation("Type de vente invalide.".to_string()));
    }
    if !matches!(
        input.price_tier.as_str(),
        "wholesale" | "semi_wholesale" | "retail"
    ) {
        return Err(CoreError::Validation(
            "Grille tarifaire invalide.".to_string(),
        ));
    }
    let global_discount =
        Money::from_non_negative(input.discount_amount.unwrap_or(0), "Remise globale")?;

    let (_guard, mut tx) = db.begin_write().await?;

    if let Some((existing_id,)) =
        sqlx::query_as::<_, (i64,)>("SELECT id FROM sales WHERE request_key = ?")
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
        let (cname, active) =
            c_row.ok_or_else(|| CoreError::Validation("Client actif introuvable.".to_string()))?;
        if active == 0 {
            return Err(CoreError::Validation(
                "Client archivé : vente impossible.".to_string(),
            ));
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

    let effective_price_tier = input.price_tier.as_str();
    let prepared = prepare_sale_lines_tx(
        &mut tx,
        &input.lines,
        effective_price_tier,
        &input.sale_type,
    )
    .await?;

    if global_discount > prepared.subtotal_merchandise {
        return Err(CoreError::Validation(
            "La remise globale dépasse le sous-total marchandises.".to_string(),
        ));
    }

    for (pid, needed_milli) in &prepared.product_deductions {
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

    let total_merchandise = prepared
        .subtotal_merchandise
        .checked_sub(global_discount, "Total marchandises")?;
    let total_amount = total_merchandise.checked_add(prepared.total_deposit, "Total vente")?;
    if total_amount.value() <= 0 {
        return Err(CoreError::Validation(
            "Le total de la vente doit être strictement positif.".to_string(),
        ));
    }

    let (normalized_payments, paid_amount) =
        normalize_sale_payments_tx(&mut tx, &input.payments).await?;

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

    let credit_amount = total_amount
        .checked_sub_non_negative(paid_amount, "Solde crédit")?
        .value();
    if input.sale_type == "credit" && credit_policy.as_deref() == Some("limited") {
        let cid = input.client_id.unwrap();
        let current_due: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables WHERE client_id = ? AND status IN ('open', 'partial')",
        )
        .bind(cid)
        .fetch_one(&mut *tx)
        .await?;
        if let Some(lim) = credit_limit {
            let next_due = (current_due as i128) + (credit_amount as i128);
            if next_due > (lim as i128) {
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
    .bind(effective_price_tier)
    .bind(prepared.subtotal_merchandise.value())
    .bind(global_discount.value())
    .bind(total_merchandise.value())
    .bind(prepared.total_deposit.value())
    .bind(total_amount.value())
    .bind(paid_amount.value())
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    let ctx = SalePersistCtx {
        sale_id,
        sale_ref: &sale_ref,
        request_key: &request_key,
        session_id,
        client_id: input.client_id,
        payment_terms_days,
        due_date: input.due_date.as_deref(),
        paid_amount,
        credit_amount,
    };
    persist_sale_lines_and_deposits_tx(&mut tx, &ctx, &prepared.lines).await?;
    persist_sale_payments_and_receivable_tx(&mut tx, &ctx, &normalized_payments).await?;

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
