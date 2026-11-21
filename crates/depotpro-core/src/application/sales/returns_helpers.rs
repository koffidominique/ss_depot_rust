// ============================================================================
// Validation des lignes de retour de vente et vérification de remboursement
// ============================================================================

use std::collections::HashSet;

use sqlx::{Sqlite, Transaction};

use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};

use super::{get_theoretical_cash_tx, SaleReturnLineInput};

pub(crate) fn normalize_return_lines(
    lines: &[SaleReturnLineInput],
) -> CoreResult<Vec<(i64, Quantity)>> {
    let mut seen_line_ids: HashSet<i64> = HashSet::with_capacity(lines.len());
    let mut normalized_lines: Vec<(i64, Quantity)> = Vec::with_capacity(lines.len());
    for l in lines {
        if l.sale_line_id <= 0 {
            return Err(CoreError::Validation(
                "Identifiant de ligne de vente invalide.".to_string(),
            ));
        }
        if !seen_line_ids.insert(l.sale_line_id) {
            return Err(CoreError::Validation(format!(
                "Ligne de vente #{} dupliquée dans la même demande de retour. Regroupez les quantités sur une seule ligne.",
                l.sale_line_id
            )));
        }
        let base_qty = Quantity::parse_str(&l.base_quantity, "Quantité retournée")?;
        if base_qty.milli_units <= 0 {
            return Err(CoreError::Validation(
                "La quantité retournée doit être > 0.".to_string(),
            ));
        }
        normalized_lines.push((l.sale_line_id, base_qty));
    }
    Ok(normalized_lines)
}

pub(crate) async fn prepare_return_lines_tx(
    tx: &mut Transaction<'_, Sqlite>,
    sale_id: i64,
    normalized_lines: &[(i64, Quantity)],
) -> CoreResult<(Money, Vec<(i64, i64, i64, i64)>)> {
    let mut total_return = Money::ZERO;
    let mut prepared: Vec<(i64, i64, i64, i64)> = Vec::with_capacity(normalized_lines.len());

    for (sale_line_id, base_qty) in normalized_lines {
        let sl: Option<(i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, base_quantity_milli, line_total FROM sale_lines WHERE id = ? AND sale_id = ?",
        )
        .bind(sale_line_id)
        .bind(sale_id)
        .fetch_optional(&mut **tx)
        .await?;
        let (sl_id, pid, sold_base_milli, line_total) =
            sl.ok_or_else(|| CoreError::Validation("Ligne de vente introuvable.".to_string()))?;

        let prev_ret: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(base_quantity_milli), 0) FROM sales_return_lines WHERE sale_line_id = ?",
        )
        .bind(sl_id)
        .fetch_one(&mut **tx)
        .await?;

        if prev_ret >= sold_base_milli {
            return Err(CoreError::Validation(format!(
                "La ligne de vente #{sl_id} a déjà été intégralement retournée."
            )));
        }
        let cum_ret = prev_ret
            .checked_add(base_qty.milli_units)
            .ok_or_else(|| CoreError::Validation("Débordement quantité retournée.".to_string()))?;
        if cum_ret > sold_base_milli {
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
        let line_amount = Money::from_i128(exact_prod / denom, "Montant retour ligne")?;
        total_return = total_return.checked_add(line_amount, "Total retour")?;
        prepared.push((sl_id, pid, base_qty.milli_units, line_amount.value()));
    }
    Ok((total_return, prepared))
}

pub(crate) async fn validate_return_refund_method_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_id: i64,
    opening_cash: i64,
    refund_method_code: &str,
    refund_amount: i64,
) -> CoreResult<()> {
    if refund_amount <= 0 {
        return Ok(());
    }
    let pm: Option<(String, i64, i64)> =
        sqlx::query_as("SELECT code, is_cash, active FROM payment_methods WHERE code = ?")
            .bind(refund_method_code)
            .fetch_optional(&mut **tx)
            .await?;
    let (_code, is_cash, active) = pm.ok_or_else(|| {
        CoreError::InvalidPayment(format!(
            "Moyen de remboursement introuvable : {refund_method_code}"
        ))
    })?;
    if active == 0 {
        return Err(CoreError::InvalidPayment(format!(
            "Moyen de remboursement inactif : {refund_method_code}"
        )));
    }
    if is_cash == 1 {
        let avail = get_theoretical_cash_tx(tx, session_id, opening_cash).await?;
        if refund_amount > avail {
            return Err(CoreError::InvalidPayment(
                "Espèces insuffisantes en caisse pour le remboursement.".to_string(),
            ));
        }
    }
    Ok(())
}
