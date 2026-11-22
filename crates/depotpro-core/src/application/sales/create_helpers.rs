// ============================================================================
// Préparation et validation des lignes de vente, consignes et paiements
// ============================================================================

use std::collections::HashMap;

use sqlx::{Sqlite, Transaction};

use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};

pub(crate) use super::create_deposit_helpers::normalize_sale_payments_tx;
use super::create_deposit_helpers::{finalize_shared_deposits, SharedDepositAccum};
use super::create_line_resolver::resolve_line_unit_tx;
use super::CreateSaleLineV4Input;

pub(crate) struct PreparedSaleLine {
    pub product_id: i64,
    pub product_name: String,
    pub packaging_id: i64,
    pub packaging_name: String,
    pub variant_id: Option<i64>,
    pub sales_unit_id: Option<i64>,
    pub sales_unit_label: Option<String>,
    pub base_unit: String,
    pub coeff_milli: i64,
    pub qty_milli: i64,
    pub base_qty_milli: i64,
    pub unit_price: i64,
    pub line_discount: i64,
    pub line_total: i64,
    pub deposit_mode: String,
    pub cost_num: Option<String>,
    pub cost_den: Option<String>,
    pub deposit_items: Vec<(i64, i64, i64, i64)>,
}

pub(crate) struct PreparedSaleLines {
    pub lines: Vec<PreparedSaleLine>,
    pub product_deductions: HashMap<i64, i64>,
    pub subtotal_merchandise: Money,
    pub total_deposit: Money,
}

pub(crate) async fn prepare_sale_lines_tx(
    tx: &mut Transaction<'_, Sqlite>,
    raw_lines: &[CreateSaleLineV4Input],
    effective_price_tier: &str,
    sale_type: &str,
) -> CoreResult<PreparedSaleLines> {
    type SaleProductRow = (
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
        i64,
        i64,
        i64,
    );

    let mut prepared_lines: Vec<PreparedSaleLine> = Vec::with_capacity(raw_lines.len());
    let mut product_deductions: HashMap<i64, i64> = HashMap::new();
    let mut shared_deposit_totals: HashMap<i64, SharedDepositAccum> = HashMap::new();
    let mut shared_deposit_order: Vec<i64> = Vec::new();
    let mut subtotal_merchandise = Money::ZERO;
    let mut total_deposit = Money::ZERO;

    for line in raw_lines {
        let prod: Option<SaleProductRow> = sqlx::query_as(
            "SELECT id, name, base_unit, average_cost_num, average_cost_den, is_active, allow_unit_sale, allow_credit_sale
             FROM products WHERE id = ?",
        )
        .bind(line.product_id)
        .fetch_optional(&mut **tx)
        .await?;
        let (
            pid,
            pname,
            base_unit,
            cost_num,
            cost_den,
            is_active,
            allow_unit_sale,
            allow_credit_sale,
        ) = prod.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;
        if is_active == 0 {
            return Err(CoreError::Validation(format!(
                "Produit \"{pname}\" archivé."
            )));
        }
        if sale_type == "credit" && allow_credit_sale == 0 {
            return Err(CoreError::CreditPolicyViolation(format!(
                "La vente à crédit n'est pas autorisée pour \"{pname}\"."
            )));
        }

        let resolved =
            resolve_line_unit_tx(tx, pid, &pname, line.packaging_id, line.sales_unit_id).await?;
        if resolved.is_unit_sale && allow_unit_sale == 0 {
            return Err(CoreError::Validation(format!(
                "La vente unitaire est désactivée pour \"{pname}\"."
            )));
        }

        let qty = Quantity::parse_str(&line.quantity, &format!("Quantité ({pname})"))?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(format!(
                "La quantité ({pname}) doit être > 0."
            )));
        }
        if resolved.allow_fraction == 0 && qty.milli_units % 1000 != 0 {
            return Err(CoreError::Validation(format!(
                "Les quantités fractionnaires ne sont pas autorisées pour \"{pname} ({})\".",
                resolved.pkg_name
            )));
        }

        let base_qty =
            qty.multiply_coefficient_to_base(Quantity::from_milli(resolved.coeff_milli))?;
        let raw_tier_price = match effective_price_tier {
            "wholesale" => resolved.p_wholesale.or(resolved.p_retail),
            "semi_wholesale" => resolved.p_semi.or(resolved.p_retail),
            _ => resolved.p_retail,
        };
        let unit_price = Money::from_non_negative(
            raw_tier_price.ok_or_else(|| {
                CoreError::Validation(format!(
                    "Tarif \"{effective_price_tier}\" non configuré pour {pname} ({}).",
                    resolved.pkg_name
                ))
            })?,
            &format!("Tarif {pname}"),
        )?;
        if let Some(min_p) = resolved.min_price {
            if unit_price.value() < min_p {
                return Err(CoreError::Validation(format!(
                    "Tarif inférieur au prix minimum autorisé ({min_p} FCFA) pour \"{pname}\"."
                )));
            }
        }

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
                .bind(resolved.pkg_id)
                .fetch_optional(&mut **tx)
                .await?;
        let (mode,) = dep_mode.ok_or_else(|| {
            CoreError::Validation(format!(
                "Le profil de consigne de \"{pname} ({})\" n'est pas configuré.",
                resolved.pkg_name
            ))
        })?;

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
            .bind(resolved.pkg_id)
            .fetch_all(&mut **tx)
            .await?;
            if comps.is_empty() {
                let fallback_dep = resolved.unit_b_dep + resolved.unit_c_dep;
                if fallback_dep <= 0 {
                    return Err(CoreError::Validation(format!(
                        "Aucun emballage consigné lié à \"{pname} ({})\".",
                        resolved.pkg_name
                    )));
                }
                let dep_line = qty.compute_line_fcfa(fallback_dep)?;
                total_deposit = total_deposit.checked_add(Money(dep_line), "Total consignes")?;
            } else {
                let line_idx = prepared_lines.len();
                for (rid, ppp, dep_val, r_name, r_kind) in comps {
                    let line_milli_pieces = qty.milli_units.checked_mul(ppp).ok_or_else(|| {
                        CoreError::Validation(
                            "Débordement du nombre de pièces consignées.".to_string(),
                        )
                    })?;
                    if r_kind == "bottle" && line_milli_pieces % 1000 == 0 {
                        let pieces = line_milli_pieces / 1000;
                        let amt = Money::from_non_negative(dep_val, "Tarif consigne")?
                            .checked_mul(pieces, "Montant consigne")?;
                        total_deposit = total_deposit.checked_add(amt, "Total consignes")?;
                        deposit_items.push((rid, pieces, dep_val, amt.value()));
                    } else if let Some(acc) = shared_deposit_totals.get_mut(&rid) {
                        acc.milli_pieces = acc
                            .milli_pieces
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
        } else if resolved.unit_b_dep + resolved.unit_c_dep > 0 {
            let dep_line = qty.compute_line_fcfa(resolved.unit_b_dep + resolved.unit_c_dep)?;
            total_deposit = total_deposit.checked_add(Money(dep_line), "Total consignes")?;
        }

        let current_deduction = product_deductions.entry(pid).or_insert(0);
        *current_deduction = current_deduction
            .checked_add(base_qty.milli_units)
            .ok_or_else(|| CoreError::Validation("Débordement quantité déduite.".to_string()))?;
        prepared_lines.push(PreparedSaleLine {
            product_id: pid,
            product_name: pname,
            packaging_id: resolved.pkg_id,
            packaging_name: resolved.pkg_name,
            variant_id: resolved.variant_id,
            sales_unit_id: resolved.sales_unit_id,
            sales_unit_label: resolved.sales_unit_label,
            base_unit,
            coeff_milli: resolved.coeff_milli,
            qty_milli: qty.milli_units,
            base_qty_milli: base_qty.milli_units,
            unit_price: unit_price.value(),
            line_discount: line_discount.value(),
            line_total: line_total.value(),
            deposit_mode: mode.clone(),
            cost_num,
            cost_den,
            deposit_items,
        });
    }

    let total_deposit = finalize_shared_deposits(
        shared_deposit_order,
        shared_deposit_totals,
        &mut prepared_lines,
        total_deposit,
    )?;

    Ok(PreparedSaleLines {
        lines: prepared_lines,
        product_deductions,
        subtotal_merchandise,
        total_deposit,
    })
}
