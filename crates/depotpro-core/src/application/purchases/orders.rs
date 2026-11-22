// ============================================================================
// Bons de commande fournisseurs : création et annulation
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::packaging_exchange::release_order_packaging_reservations_tx;
use super::{
    list_purchase_orders, CancelPurchaseOrderInput, CreatePurchaseOrderInput, PurchaseOrderDto,
};

pub async fn create_purchase_order(
    db: &DepotDb,
    input: CreatePurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "Ajoutez au moins une ligne de commande.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some((existing_id,)) =
        sqlx::query_as::<_, (i64,)>("SELECT id FROM purchase_orders WHERE request_key = ?")
            .bind(&request_key)
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
        return Err(CoreError::Validation(
            "Fournisseur introuvable.".to_string(),
        ));
    }

    type PackagingRequirement = (i64, String, String, String, i64, i64);
    type PreparedPurchaseOrderLine = (
        i64, i64, String, String, String, i64, i64, i64, i64,
        String, String, Vec<PackagingRequirement>,
    );
    let mut total_amount = Money::ZERO;
    let mut prepared: Vec<PreparedPurchaseOrderLine> = Vec::new();
    let mut staged_packaging_reservations: std::collections::HashMap<i64, i64> =
        std::collections::HashMap::new();

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
            return Err(CoreError::Validation(
                "La quantité commandée doit être > 0.".to_string(),
            ));
        }
        let unit_price = Money::from_non_negative(l.unit_price, &format!("Prix achat ({pname})"))?;
        let line_total = Money(qty.compute_line_fcfa(unit_price.value())?);
        total_amount = total_amount.checked_add(line_total, "Total commande")?;

        let (deposit_mode,): (String,) = sqlx::query_as(
            "SELECT mode FROM deposit_packaging_profiles WHERE packaging_id = ?",
        ).bind(pkg_id).fetch_optional(&mut *tx).await?
         .ok_or_else(|| CoreError::Validation(format!("Profil d'emballage non configuré pour {pname} ({pkg_name}).")))?;
        let packaging_components: Vec<(i64, i64, String, String, String)> = if deposit_mode == "deposit" {
            sqlx::query_as(
                "SELECT dpc.returnable_id, SUM(dpc.pieces_per_pack), rpt.code, rpt.name, rpt.kind
                 FROM deposit_packaging_components dpc JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?
                 GROUP BY dpc.returnable_id, rpt.code, rpt.name, rpt.kind",
            ).bind(pkg_id).fetch_all(&mut *tx).await?
        } else if deposit_mode == "none" {
            Vec::new()
        } else {
            return Err(CoreError::Validation(format!("Profil d'emballage inconnu : {deposit_mode}.")));
        };
        if deposit_mode == "deposit" && packaging_components.is_empty() {
            return Err(CoreError::Validation(format!("Le conditionnement {pkg_name} est consigné mais ne possède aucun composant d'emballage configuré.")));
        }
        let mut requirements = Vec::with_capacity(packaging_components.len());
        for (returnable_id, pieces_per_pack, code, name, kind) in packaging_components {
            let numerator = (qty.milli_units as i128).checked_mul(pieces_per_pack as i128)
                .ok_or_else(|| CoreError::Validation("Débordement du calcul d'emballages.".into()))?;
            if numerator % 1000 != 0 {
                return Err(CoreError::Validation(format!("La quantité commandée pour {pname} produit une quantité physique fractionnaire d'emballages ({code}).")));
            }
            let required = i64::try_from(numerator / 1000)
                .map_err(|_| CoreError::Validation("Débordement quantité emballages.".into()))?;
            let physical: i64 = sqlx::query_scalar("SELECT COALESCE((SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?), 0)")
                .bind(returnable_id).fetch_one(&mut *tx).await?;
            let reserved: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(r.reserved_pieces), 0) FROM purchase_order_packaging_requirements r
                 WHERE r.returnable_id = ? AND r.reservation_status IN ('reserved', 'partially_issued')",
            ).bind(returnable_id).fetch_one(&mut *tx).await?;
            let staged = *staged_packaging_reservations.get(&returnable_id).unwrap_or(&0);
            let available = physical.saturating_sub(reserved).saturating_sub(staged);
            if available < required {
                return Err(CoreError::InsufficientStock(format!("Emballages fournisseur insuffisants ({code}: disponible {available}, requis {required}).")));
            }
            *staged_packaging_reservations.entry(returnable_id).or_default() += required;
            requirements.push((returnable_id, code, name, kind, pieces_per_pack, required));
        }
        let (brand, brewery, variant, volume_ml): (Option<String>, Option<String>, Option<String>, Option<i64>) = sqlx::query_as(
            "SELECT COALESCE(p.brand, br.name), b.name, COALESCE(pv.name, p.variant_label), pv.volume_ml
             FROM products p LEFT JOIN brands br ON br.id = p.brand_id
             LEFT JOIN breweries b ON b.id = COALESCE(p.brewery_id, br.brewery_id)
             LEFT JOIN product_variants pv ON pv.id = COALESCE((SELECT variant_id FROM product_packagings WHERE id = ?), p.variant_id)
             WHERE p.id = ?",
        ).bind(pkg_id).bind(pid).fetch_one(&mut *tx).await?;
        let product_snapshot = serde_json::json!({
            "id": pid, "name": &pname, "brand": brand, "brewery": brewery,
            "variant": variant, "volumeMl": volume_ml, "baseUnit": &base_unit
        }).to_string();
        let packaging_snapshot = serde_json::json!({
            "id": pkg_id, "name": &pkg_name, "coefficientMilli": coeff_milli,
            "depositRegime": deposit_mode, "components": requirements.iter().map(|(id, code, name, kind, per_pack, pieces)| serde_json::json!({
                "returnableId": id, "code": code, "name": name, "kind": kind,
                "piecesPerPack": per_pack, "requiredPieces": pieces
            })).collect::<Vec<_>>()
        }).to_string();
        prepared.push((
            pid, pkg_id, pname, pkg_name, base_unit, coeff_milli, qty.milli_units,
            unit_price.value(), line_total.value(), product_snapshot, packaging_snapshot, requirements,
        ));
    }

    let reference = DepotDb::next_sequence(&mut tx, "CMD").await?;
    let expected_date = input
        .expected_date
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let po_id = sqlx::query(
        "INSERT INTO purchase_orders (reference, request_key, supplier_id, status, total_amount, expected_date, notes)
         VALUES (?, ?, ?, 'confirmed', ?, ?, ?)",
    )
    .bind(&reference)
    .bind(&request_key)
    .bind(input.supplier_id)
    .bind(total_amount.value())
    .bind(expected_date)
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for p in prepared {
        let line_id = sqlx::query(
            "INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total, product_snapshot_json, packaging_snapshot_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(po_id).bind(p.0).bind(p.1).bind(&p.2).bind(&p.3).bind(&p.4)
        .bind(p.5).bind(p.6).bind(p.7).bind(p.8).bind(&p.9).bind(&p.10)
        .execute(&mut *tx).await?.last_insert_rowid();
        for (returnable_id, code, name, kind, pieces_per_pack, required_pieces) in &p.11 {
            sqlx::query(
                "INSERT INTO purchase_order_packaging_requirements (purchase_order_line_id, returnable_id, code_snapshot, name_snapshot, kind_snapshot, pieces_per_pack, required_pieces, reserved_pieces, issued_pieces, reservation_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'reserved')",
            ).bind(line_id).bind(returnable_id).bind(code).bind(name).bind(kind)
             .bind(pieces_per_pack).bind(required_pieces).bind(required_pieces)
             .execute(&mut *tx).await?;
        }
    }

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

pub async fn update_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: super::UpdatePurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    if purchase_order_id <= 0 || input.lines.is_empty() {
        return Err(CoreError::Validation("Bon invalide : ajoutez au moins une ligne.".into()));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let state: Option<(String, i64)> = sqlx::query_as(
        "SELECT w.status, po.received_amount FROM purchase_orders po
         LEFT JOIN commercial_document_workflows w ON w.document_type = 'purchase_order' AND w.document_id = po.id
         WHERE po.id = ? AND po.status = 'confirmed'",
    ).bind(purchase_order_id).fetch_optional(&mut *tx).await?;
    let (approval_status, received_amount) = state
        .ok_or_else(|| CoreError::HistoricalImmutable("Seuls les bons confirmés peuvent être corrigés.".into()))?;
    if approval_status != "changes_requested" || received_amount != 0 {
        return Err(CoreError::Forbidden("La modification est réservée aux bons renvoyés pour correction et non réceptionnés.".into()));
    }
    let receipt_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM purchase_receipts WHERE purchase_order_id = ?",
    ).bind(purchase_order_id).fetch_one(&mut *tx).await?;
    if receipt_count > 0 {
        return Err(CoreError::HistoricalImmutable("Un bon ayant une réception ne peut plus être modifié.".into()));
    }
    let supplier_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1")
        .bind(input.supplier_id).fetch_one(&mut *tx).await?;
    if supplier_exists == 0 {
        return Err(CoreError::Validation("Fournisseur absent ou inactif.".into()));
    }
    sqlx::query(
        "DELETE FROM purchase_order_packaging_requirements WHERE purchase_order_line_id IN (SELECT id FROM purchase_order_lines WHERE purchase_order_id = ?)",
    ).bind(purchase_order_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM purchase_order_lines WHERE purchase_order_id = ?")
        .bind(purchase_order_id).execute(&mut *tx).await?;
    let mut total = Money::ZERO;
    let mut prepared = Vec::with_capacity(input.lines.len());
    let mut staged: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    for line in &input.lines {
        let product: Option<(String, String)> = sqlx::query_as(
            "SELECT name, base_unit FROM products WHERE id = ? AND is_active = 1",
        ).bind(line.product_id).fetch_optional(&mut *tx).await?;
        let (product_name, base_unit) = product.ok_or_else(|| CoreError::Validation("Produit absent ou inactif.".into()))?;
        let packaging: Option<(String, i64)> = sqlx::query_as(
            "SELECT name, coefficient_milli FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1",
        ).bind(line.packaging_id).bind(line.product_id).fetch_optional(&mut *tx).await?;
        let (packaging_name, coefficient) = packaging.ok_or_else(|| CoreError::Validation("Conditionnement invalide ou inactif.".into()))?;
        let quantity = Quantity::parse_str(&line.quantity, &format!("Quantité ({product_name})"))?;
        if quantity.milli_units <= 0 { return Err(CoreError::Validation("La quantité doit être supérieure à zéro.".into())); }
        let price = Money::from_non_negative(line.unit_price, &format!("Prix ({product_name})"))?;
        let line_total = Money(quantity.compute_line_fcfa(price.value())?);
        total = total.checked_add(line_total, "Total du bon")?;
        let (mode,): (String,) = sqlx::query_as("SELECT mode FROM deposit_packaging_profiles WHERE packaging_id = ?")
            .bind(line.packaging_id).fetch_optional(&mut *tx).await?
            .ok_or_else(|| CoreError::Validation(format!("Profil d'emballage non configuré pour {product_name} ({packaging_name}).")))?;
        let components: Vec<(i64, i64, String, String, String)> = if mode == "deposit" {
            sqlx::query_as(
                "SELECT dpc.returnable_id, SUM(dpc.pieces_per_pack), rpt.code, rpt.name, rpt.kind
                 FROM deposit_packaging_components dpc JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?
                 GROUP BY dpc.returnable_id, rpt.code, rpt.name, rpt.kind",
            ).bind(line.packaging_id).fetch_all(&mut *tx).await?
        } else if mode == "none" { Vec::new() }
        else { return Err(CoreError::Validation(format!("Profil d'emballage inconnu : {mode}."))); };
        if mode == "deposit" && components.is_empty() {
            return Err(CoreError::Validation(format!("Le conditionnement {packaging_name} est consigné mais aucun composant n'est configuré.")));
        }
        let mut requirements = Vec::new();
        for (rid, per_pack, code, name, kind) in components {
            let numerator = (quantity.milli_units as i128).checked_mul(per_pack as i128)
                .ok_or_else(|| CoreError::Validation("Débordement quantité emballages.".into()))?;
            if numerator % 1000 != 0 { return Err(CoreError::Validation(format!("La commande corrigée génère une quantité fractionnaire d'emballages ({code})."))); }
            let pieces = i64::try_from(numerator / 1000).map_err(|_| CoreError::Validation("Débordement quantité emballages.".into()))?;
            let physical: i64 = sqlx::query_scalar("SELECT COALESCE((SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?), 0)").bind(rid).fetch_one(&mut *tx).await?;
            let reserved: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(reserved_pieces), 0) FROM purchase_order_packaging_requirements WHERE returnable_id = ? AND reservation_status IN ('reserved', 'partially_issued')")
                .bind(rid).fetch_one(&mut *tx).await?;
            let available = physical.saturating_sub(reserved).saturating_sub(*staged.get(&rid).unwrap_or(&0));
            if available < pieces { return Err(CoreError::InsufficientStock(format!("Emballages fournisseur insuffisants ({code}: disponible {available}, requis {pieces})."))); }
            *staged.entry(rid).or_default() += pieces;
            requirements.push((rid, code, name, kind, per_pack, pieces));
        }
        let (brand, brewery, variant, volume_ml): (Option<String>, Option<String>, Option<String>, Option<i64>) = sqlx::query_as(
            "SELECT COALESCE(p.brand, br.name), b.name, COALESCE(pv.name, p.variant_label), pv.volume_ml
             FROM products p LEFT JOIN brands br ON br.id = p.brand_id
             LEFT JOIN breweries b ON b.id = COALESCE(p.brewery_id, br.brewery_id)
             LEFT JOIN product_variants pv ON pv.id = COALESCE((SELECT variant_id FROM product_packagings WHERE id = ?), p.variant_id)
             WHERE p.id = ?",
        ).bind(line.packaging_id).bind(line.product_id).fetch_one(&mut *tx).await?;
        let product_snapshot = serde_json::json!({
            "id": line.product_id, "name": &product_name, "brand": brand, "brewery": brewery,
            "variant": variant, "volumeMl": volume_ml, "baseUnit": &base_unit
        }).to_string();
        let packaging_snapshot = serde_json::json!({"id": line.packaging_id, "name": &packaging_name,
            "coefficientMilli": coefficient, "depositRegime": mode,
            "components": requirements.iter().map(|(id, code, name, kind, per_pack, pieces)| serde_json::json!({
                "returnableId": id, "code": code, "name": name, "kind": kind,
                "piecesPerPack": per_pack, "requiredPieces": pieces
            })).collect::<Vec<_>>()}).to_string();
        prepared.push((line.product_id, line.packaging_id, product_name, packaging_name, base_unit,
            coefficient, quantity.milli_units, price.value(), line_total.value(), product_snapshot, packaging_snapshot, requirements));
    }
    let reference: String = sqlx::query_scalar("SELECT reference FROM purchase_orders WHERE id = ?")
        .bind(purchase_order_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE purchase_orders SET supplier_id = ?, total_amount = ? WHERE id = ?")
        .bind(input.supplier_id).bind(total.value()).bind(purchase_order_id).execute(&mut *tx).await?;
    for line in prepared {
        let line_id = sqlx::query(
            "INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total, product_snapshot_json, packaging_snapshot_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(purchase_order_id).bind(line.0).bind(line.1).bind(&line.2).bind(&line.3).bind(&line.4)
         .bind(line.5).bind(line.6).bind(line.7).bind(line.8).bind(&line.9).bind(&line.10)
         .execute(&mut *tx).await?.last_insert_rowid();
        for (rid, code, name, kind, per_pack, pieces) in &line.11 {
            sqlx::query(
                "INSERT INTO purchase_order_packaging_requirements (purchase_order_line_id, returnable_id, code_snapshot, name_snapshot, kind_snapshot, pieces_per_pack, required_pieces, reserved_pieces, issued_pieces, reservation_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'reserved')",
            ).bind(line_id).bind(rid).bind(code).bind(name).bind(kind).bind(per_pack).bind(pieces).bind(pieces)
             .execute(&mut *tx).await?;
        }
    }
    let actor = crate::application::auth::current_actor()
        .ok_or_else(|| CoreError::Forbidden("Session authentifiée requise pour soumettre la correction.".into()))?;
    let submitter = actor.user_id.parse::<i64>().ok();
    let supplier_name: String = sqlx::query_scalar("SELECT name FROM suppliers WHERE id = ?")
        .bind(input.supplier_id).fetch_one(&mut *tx).await?;
    let snapshot_lines: Vec<(String, String, i64, i64, i64)> = sqlx::query_as(
        "SELECT product_name, packaging_name, ordered_quantity_milli, unit_price, line_total
         FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id",
    ).bind(purchase_order_id).fetch_all(&mut *tx).await?;
    let snapshot = serde_json::json!({
        "documentType": "purchase_order", "id": purchase_order_id, "number": reference,
        "counterparty": supplier_name, "status": "confirmed", "totalXof": total.value(),
        "items": snapshot_lines.into_iter().map(|(product, packaging, quantity, unit_price, line_total)| serde_json::json!({
            "product": product, "packaging": packaging, "quantityMilli": quantity,
            "unitPriceXof": unit_price, "lineTotalXof": line_total
        })).collect::<Vec<_>>()
    });
    sqlx::query(
        "UPDATE commercial_document_workflows SET status = 'pending_owner_approval', submitted_by = ?,
         submitted_at = datetime('now'), reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL,
         updated_at = datetime('now') WHERE document_type = 'purchase_order' AND document_id = ? AND status = 'changes_requested'",
    ).bind(submitter).bind(purchase_order_id).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO document_approval_events (document_type, document_id, action, actor_user_id, actor_role, reason, snapshot_json)
         VALUES ('purchase_order', ?, 'submitted', ?, ?, 'Correction resoumise après demande Owner', ?)",
    ).bind(purchase_order_id).bind(submitter).bind(actor.role.as_str()).bind(snapshot.to_string())
     .execute(&mut *tx).await?;
    audit_log_tx(&mut tx, "UPDATE_PO_AFTER_CORRECTION", "purchase_orders", Some(purchase_order_id.to_string()),
        &format!("Bon {reference} corrigé et resoumis pour approbation Owner; montant {} FCFA.", total.value())).await?;
    tx.commit().await?;
    list_purchase_orders(db).await?.into_iter().find(|po| po.id == purchase_order_id)
        .ok_or_else(|| CoreError::Internal("Bon corrigé introuvable.".into()))
}

pub async fn cancel_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: CancelPurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    if purchase_order_id <= 0 {
        return Err(CoreError::Validation(
            "Bon de commande invalide.".to_string(),
        ));
    }
    let reason = input.reason.trim();
    if reason.is_empty() {
        return Err(CoreError::Validation(
            "Le motif d'annulation est obligatoire.".to_string(),
        ));
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

    release_order_packaging_reservations_tx(&mut tx, purchase_order_id).await?;

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
        .ok_or_else(|| {
            CoreError::Internal("Bon de commande introuvable après annulation.".to_string())
        })
}
