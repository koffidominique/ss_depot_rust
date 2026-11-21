// ============================================================================
// Consultation des bons de commande fournisseurs et de leurs pièces liées
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    PurchaseOrderDto, PurchaseOrderLineDto, PurchaseOrderRow, PurchaseReceiptDto, SupplierDebtDto,
};

pub async fn list_purchase_orders(db: &DepotDb) -> CoreResult<Vec<PurchaseOrderDto>> {
    require_current_actor_permission(Permission::PurchasesRead)?;
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

        let debts = sqlx::query_as::<_, SupplierDebtDto>(
            "SELECT sd.id, sd.receipt_id, sd.supplier_id, s.name AS supplier_name, s.code AS supplier_code,
                    pr.reference AS receipt_reference, po.reference AS order_reference,
                    sd.initial_amount, sd.remaining_amount, sd.due_date, sd.status, sd.created_at
             FROM supplier_debts sd
             JOIN suppliers s ON s.id = sd.supplier_id
             JOIN purchase_receipts pr ON pr.id = sd.receipt_id
             JOIN purchase_orders po ON po.id = pr.purchase_order_id
             WHERE pr.purchase_order_id = ?
             ORDER BY sd.id DESC",
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
            debts,
        });
    }
    Ok(result)
}
