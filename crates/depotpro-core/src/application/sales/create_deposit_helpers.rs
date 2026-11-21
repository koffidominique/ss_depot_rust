// ============================================================================
// Calcul des consignes partagées (panachage) et validation des paiements
// ============================================================================

use std::collections::HashMap;

use sqlx::{Sqlite, Transaction};

use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};

use super::create_helpers::PreparedSaleLine;
use super::PaymentPartInput;

pub(crate) struct SharedDepositAccum {
    pub name: String,
    pub unit_value: i64,
    pub milli_pieces: i64,
    pub first_line_idx: usize,
}

pub(crate) fn finalize_shared_deposits(
    shared_deposit_order: Vec<i64>,
    shared_deposit_totals: HashMap<i64, SharedDepositAccum>,
    prepared_lines: &mut [PreparedSaleLine],
    mut total_deposit: Money,
) -> CoreResult<Money> {
    for rid in shared_deposit_order {
        let acc = &shared_deposit_totals[&rid];
        if acc.milli_pieces % 1000 != 0 {
            let formatted = format!(
                "{}.{:03}",
                acc.milli_pieces / 1000,
                (acc.milli_pieces % 1000).abs()
            );
            let clean = formatted.trim_end_matches('0').trim_end_matches('.');
            return Err(CoreError::Validation(format!(
                "Panachage incomplet pour « {} » : la somme des demi-casiers doit former un nombre entier de casiers (total actuel : {clean}).",
                acc.name
            )));
        }
        let pieces = acc.milli_pieces / 1000;
        let amt = Money::from_non_negative(acc.unit_value, "Tarif consigne")?
            .checked_mul(pieces, "Montant consigne")?;
        total_deposit = total_deposit.checked_add(amt, "Total consignes")?;
        prepared_lines[acc.first_line_idx].deposit_items.push((
            rid,
            pieces,
            acc.unit_value,
            amt.value(),
        ));
    }
    Ok(total_deposit)
}

pub(crate) async fn normalize_sale_payments_tx(
    tx: &mut Transaction<'_, Sqlite>,
    payments: &[PaymentPartInput],
) -> CoreResult<(Vec<(String, i64)>, Money)> {
    let mut normalized_payments: Vec<(String, i64)> = Vec::new();
    let mut paid_amount = Money::ZERO;
    for p in payments {
        let amt = Money::from_positive(p.amount, &format!("Montant ({})", p.method_code))?;
        let pm: Option<(String, i64)> =
            sqlx::query_as("SELECT code, active FROM payment_methods WHERE code = ?")
                .bind(&p.method_code)
                .fetch_optional(&mut **tx)
                .await?;
        let (code, active) = pm.ok_or_else(|| {
            CoreError::InvalidPayment(format!("Moyen de paiement introuvable : {}", p.method_code))
        })?;
        if active == 0 {
            return Err(CoreError::InvalidPayment(format!(
                "Moyen de paiement inactif : {code}"
            )));
        }
        paid_amount = paid_amount.checked_add(amt, "Total encaissé")?;
        normalized_payments.push((code, amt.value()));
    }
    Ok((normalized_payments, paid_amount))
}
