// ============================================================================
// Préparation et validation des lignes de vente, consignes et paiements
// ============================================================================

use std::collections::HashMap;

use sqlx::{Sqlite, Transaction};

use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};

use super::{CreateSaleLineInput, PaymentPartInput};

pub(crate) struct PreparedSaleLine {
    pub product_id: i64,
    pub product_name: String,
    pub packaging_id: i64,
    pub packaging_name: String,
    pub base_unit: String,
    pub coeff_milli: i64,
    pub qty_milli: i64,
    pub base_qty_milli: i64,
    pub unit_price: i64,
    pub line_discount: i64,
    pub line_total: i64,
    pub cost_num: Option<String>,
    pub cost_den: Option<String>,
    pub deposit_items: Vec<(i64, i64, i64, i64)>,
}

struct SharedDepositAccum {
    name: String,
    unit_value: i64,
    milli_pieces: i64,
    first_line_idx: usize,
}

pub(crate) struct PreparedSaleLines {
    pub lines: Vec<PreparedSaleLine>,
    pub product_deductions: HashMap<i64, i64>,
    pub subtotal_merchandise: Money,
    pub total_deposit: Money,
}

pub(crate) async fn prepare_sale_lines_tx(
    tx: &mut Transaction<'_, Sqlite>,
    raw_lines: &[CreateSaleLineInput],
    effective_price_tier: &str,
) -> CoreResult<PreparedSaleLines> {
    type SaleProductRow = (i64, String, String, Option<String>, Option<String>, i64);
    type SalePackagingRow = (i64, String, i64, Option<i64>, i64);

    let mut prepared_lines: Vec<PreparedSaleLine> = Vec::with_capacity(raw_lines.len());
    let mut product_deductions: HashMap<i64, i64> = HashMap::new();
    let mut shared_deposit_totals: HashMap<i64, SharedDepositAccum> = HashMap::new();
    let mut shared_deposit_order: Vec<i64> = Vec::new();
    let mut subtotal_merchandise = Money::ZERO;
    let mut total_deposit = Money::ZERO;

    for line in raw_lines {
        let prod: Option<SaleProductRow> = sqlx::query_as(
            "SELECT id, name, base_unit, average_cost_num, average_cost_den, is_active FROM products WHERE id = ?",
        )
        .bind(line.product_id)
        .fetch_optional(&mut **tx)
        .await?;
        let (pid, pname, base_unit, cost_num, cost_den, is_active) =
            prod.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;
        if is_active == 0 {
            return Err(CoreError::Validation(format!(
                "Produit \"{pname}\" archivé."
            )));
        }

        let pkg: Option<SalePackagingRow> = sqlx::query_as(
            "SELECT id, name, coefficient_milli, retail_price, allow_fraction
             FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1",
        )
        .bind(line.packaging_id)
        .bind(pid)
        .fetch_optional(&mut **tx)
        .await?;
        let (pkg_id, pkg_name, coeff_milli, p_retail, allow_fraction) = pkg.ok_or_else(|| {
            CoreError::Validation(format!("Conditionnement invalide pour \"{pname}\"."))
        })?;
        if pkg_name != "casier" {
            return Err(CoreError::Validation(format!(
                "Seul le conditionnement \"casier\" est autorisé à la vente (reçu \"{pkg_name}\" pour \"{pname}\")."
            )));
        }

        let qty = Quantity::parse_str(&line.quantity, &format!("Quantité ({pname})"))?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(format!(
                "La quantité ({pname}) doit être > 0."
            )));
        }
        if allow_fraction == 0 && qty.milli_units % 1000 != 0 {
            return Err(CoreError::Validation(format!(
                "Les quantités fractionnaires ne sont pas autorisées pour \"{pname} ({pkg_name})\"."
            )));
        }

        let base_qty = qty.multiply_coefficient_to_base(Quantity::from_milli(coeff_milli))?;
        let unit_price = Money::from_non_negative(
            p_retail.ok_or_else(|| {
                CoreError::Validation(format!(
                    "Tarif \"{effective_price_tier}\" non configuré pour {pname} ({pkg_name})."
                ))
            })?,
            &format!("Tarif {pname}"),
        )?;

        let gross_line = qty.compute_line_fcfa(unit_price.value())?;
        let line_discount =
            Money::from_non_negative(line.discount_amount.unwrap_or(0), "Remise ligne")?;
        if line_discount.value() > gross_line {
            return Err(CoreError::Validation(format!(
                "Remise supérieure au montant de la ligne ({pname})."
            )));
        }
        let line_total = Money(gross_line - line_discount.value());
        subtotal_merchandise = subtotal_merchandise.checked_add(line_total, "Sous-total")?;

        let dep_mode: Option<(String,)> =
            sqlx::query_as("SELECT mode FROM deposit_packaging_profiles WHERE packaging_id = ?")
                .bind(pkg_id)
                .fetch_optional(&mut **tx)
                .await?;
        let (mode,) = dep_mode.ok_or_else(|| {
            CoreError::Validation(format!(
                "Le profil de consigne de \"{pname} ({pkg_name})\" n'est pas configuré."
            ))
        })?;
        if mode == "deposit" && pkg_name != "casier" {
            return Err(CoreError::Validation(format!(
                "Seul le conditionnement \"casier\" est soumis au système de retour d'emballage (\"{pname}\")."
            )));
        }

        let mut deposit_items = Vec::new();
        if mode == "deposit" {
            if base_qty.milli_units % 1000 != 0 {
                return Err(CoreError::Validation(format!(
                    "Les ventes consignées doivent correspondre à un nombre entier d'unités de base ({pname})."
                )));
            }
            let comps: Vec<(i64, i64, i64, String, String)> = sqlx::query_as(
                "SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.deposit_value, rpt.name, rpt.kind
                 FROM deposit_packaging_components dpc
                 JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?",
            )
            .bind(pkg_id)
            .fetch_all(&mut **tx)
            .await?;
            if comps.is_empty() {
                return Err(CoreError::Validation(format!(
                    "Aucun emballage consigné lié à \"{pname} ({pkg_name})\"."
                )));
            }
            let line_idx = prepared_lines.len();
            for (rid, ppp, dep_val, r_name, r_kind) in comps {
                let line_milli_pieces = qty.milli_units.checked_mul(ppp).ok_or_else(|| {
                    CoreError::Validation("Débordement du nombre de pièces consignées.".to_string())
                })?;
                if r_kind == "bottle" && line_milli_pieces % 1000 == 0 {
                    let pieces = line_milli_pieces / 1000;
                    let amt = Money::from_non_negative(dep_val, "Tarif consigne")?
                        .checked_mul(pieces, "Montant consigne")?;
                    total_deposit = total_deposit.checked_add(amt, "Total consignes")?;
                    deposit_items.push((rid, pieces, dep_val, amt.value()));
                } else if let Some(acc) = shared_deposit_totals.get_mut(&rid) {
                    acc.milli_pieces =
                        acc.milli_pieces
                            .checked_add(line_milli_pieces)
                            .ok_or_else(|| {
                                CoreError::Validation(
                                    "Débordement du nombre de pièces consignées.".to_string(),
                                )
                            })?;
                } else {
                    shared_deposit_order.push(rid);
                    shared_deposit_totals.insert(
                        rid,
                        SharedDepositAccum {
                            name: r_name,
                            unit_value: dep_val,
                            milli_pieces: line_milli_pieces,
                            first_line_idx: line_idx,
                        },
                    );
                }
            }
        }

        let current_deduction = product_deductions.entry(pid).or_insert(0);
        *current_deduction = current_deduction
            .checked_add(base_qty.milli_units)
            .ok_or_else(|| CoreError::Validation("Débordement quantité déduite.".to_string()))?;
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

    Ok(PreparedSaleLines {
        lines: prepared_lines,
        product_deductions,
        subtotal_merchandise,
        total_deposit,
    })
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
