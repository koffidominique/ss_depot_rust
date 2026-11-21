//! Tests métier des créances d'emballages (MAJ.md sections 6, 7, 18).
//! Couvre : Tests 1, 2, 3, 4, 5, 6 et 10 du MAJ.md.

use depotpro_core::application::packaging_obligations::{
    declare_loss, get_client_packaging_dashboard, get_client_packaging_financial_balance,
    list_obligations, pay_packaging_financial_debt, process_due_obligations, register_late_return,
    validate_loss_declaration, DeclareLossInput, PayPackagingDebtInput, PayPackagingPart,
};
use depotpro_core::infrastructure::db::DepotDb;

async fn fresh_db(tag: &str) -> DepotDb {
    let path = std::env::temp_dir().join(format!("pkg_obl_{tag}_{}.db", uuid::Uuid::new_v4()));
    DepotDb::connect(&path).await.expect("connect")
}

async fn seed_fixture(db: &DepotDb) -> (i64, i64) {
    // Client + type d'emballage + une obligation de 5 casiers à 3600 FCFA, échue hier.
    let mut g = db.begin_write().await.unwrap();
    let tx = &mut g.1;
    sqlx::query("INSERT INTO clients (code, name, client_type) VALUES ('CLI-TEST', 'Client Test', 'particulier')")
        .execute(&mut **tx).await.unwrap();
    let client_id: i64 = sqlx::query_scalar("SELECT id FROM clients WHERE code = 'CLI-TEST'")
        .fetch_one(&mut **tx)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value)
         VALUES ('EMB-TEST', 'Casier test', 'SOLIBRA', 'crate', 'Casier de test', 3600)",
    )
    .execute(&mut **tx).await.unwrap();
    let rid: i64 =
        sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE code = 'EMB-TEST'")
            .fetch_one(&mut **tx)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO sales (reference, request_key, sale_type, subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status, client_id)
         VALUES ('VTE-TEST-1', 'rk-vte-test-1', 'credit', 12000, 0, 12000, 18000, 30000, 8000, 'validated', ?)",
    )
    .bind(client_id).execute(&mut **tx).await.unwrap();
    let sale_id: i64 = sqlx::query_scalar("SELECT id FROM sales WHERE reference = 'VTE-TEST-1'")
        .fetch_one(&mut **tx)
        .await
        .unwrap();
    sqlx::query("INSERT INTO categories (name) VALUES ('Bières test')")
        .execute(&mut **tx)
        .await
        .unwrap();
    let cat_id: i64 = sqlx::query_scalar("SELECT id FROM categories WHERE name = 'Bières test'")
        .fetch_one(&mut **tx)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO products (reference, name, category_id, base_unit, stock_milli)
         VALUES ('PROD-TEST-1', 'Bière test', ?, 'bouteille', 100000)",
    )
    .bind(cat_id)
    .execute(&mut **tx)
    .await
    .unwrap();
    let product_id: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-TEST-1'")
            .fetch_one(&mut **tx)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli)
         VALUES (?, 'casier', 'bouteille', 24000)",
    )
    .bind(product_id)
    .execute(&mut **tx)
    .await
    .unwrap();
    let packaging_id: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'casier'",
    )
    .bind(product_id)
    .fetch_one(&mut **tx)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO sale_lines (sale_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total)
         VALUES (?, ?, ?, 'Bière test', 'casier', 'bouteille', 24000, 24000, 24000, 12000, 0, 12000)",
    )
    .bind(sale_id).bind(product_id).bind(packaging_id).execute(&mut **tx).await.unwrap();
    let line_id: i64 = sqlx::query_scalar("SELECT id FROM sale_lines WHERE sale_id = ?")
        .bind(sale_id)
        .fetch_one(&mut **tx)
        .await
        .unwrap();
    // Obligation échue : 5 casiers dus à 3600, échéance hier.
    let yesterday = (chrono::Utc::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    sqlx::query(
        "INSERT INTO deposit_issues (sale_id, sale_line_id, client_id, returnable_id, pieces, unit_value, amount, due_date, policy_id, status)
         VALUES (?, ?, ?, ?, 5, 3600, 18000, ?, 1, 'pending')",
    )
    .bind(sale_id).bind(line_id).bind(client_id).bind(rid).bind(&yesterday)
    .execute(&mut **tx).await.unwrap();
    g.1.commit().await.unwrap();
    (client_id, 1) // issue_id = 1 (base vierge)
}

#[tokio::test]
async fn test3_non_restitution_a_echeance_convertit_et_idempotent() {
    // MAJ.md Test 3 + Test 10 (idempotence).
    let db = fresh_db("due").await;
    let (client_id, issue_id) = seed_fixture(&db).await;

    let s1 = process_due_obligations(&db, Some("owner")).await.unwrap();
    assert_eq!(s1.conversions, 1, "Une seule conversion à la 1re exécution");
    assert_eq!(s1.total_amount, 5 * 3600, "Créance = 5 × 3600 = 18000");

    let s2 = process_due_obligations(&db, Some("owner")).await.unwrap();
    assert_eq!(s2.conversions, 0, "Idempotent : rien à la 2e exécution");
    assert_eq!(s2.total_amount, 0);

    let bal = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(bal.packaging_financial_balance, 18000);

    let conv_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM packaging_conversions WHERE deposit_issue_id = ?")
            .bind(issue_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(conv_count, 1, "Une seule ligne de conversion");
}

#[tokio::test]
async fn test2_restitution_avant_echeance_solde_sans_dette() {
    // MAJ.md Test 2 : restitution → 0 dette, stock d'emballages +.
    let db = fresh_db("early").await;
    let (client_id, issue_id) = seed_fixture(&db).await;
    // Rendre l'échéance future.
    sqlx::query("UPDATE deposit_issues SET due_date = date('now', '+30 days') WHERE id = ?")
        .bind(issue_id)
        .execute(&db.pool)
        .await
        .unwrap();

    // Retour de 2 casiers avant échéance via register_late_return (retour simple).
    let credited = register_late_return(&db, issue_id, 2, Some("owner"))
        .await
        .unwrap();
    assert_eq!(credited, 0, "Aucun crédit : rien n'a été converti");

    // L'échéance passe ensuite : seuls les 3 casiers restants sont convertis.
    sqlx::query("UPDATE deposit_issues SET due_date = date('now', '-1 day') WHERE id = ?")
        .bind(issue_id)
        .execute(&db.pool)
        .await
        .unwrap();
    let s = process_due_obligations(&db, None).await.unwrap();
    assert_eq!(
        s.total_amount,
        3 * 3600,
        "Seuls les 3 casiers restants sont convertis"
    );

    let bal = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(bal.packaging_financial_balance, 10800);
    let stock: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(quantity), 0) FROM returnable_stock_balances WHERE packaging_id = 1",
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(stock, 2, "Stock d'emballages vides incrémenté de 2");
}

#[tokio::test]
async fn test5_perte_avant_echeance_validee_convertit_une_seule_fois() {
    // MAJ.md Test 5.
    let db = fresh_db("loss").await;
    let (client_id, issue_id) = seed_fixture(&db).await;
    sqlx::query("UPDATE deposit_issues SET due_date = date('now', '+30 days') WHERE id = ?")
        .bind(issue_id)
        .execute(&db.pool)
        .await
        .unwrap();

    let decl_id = declare_loss(
        &db,
        DeclareLossInput {
            deposit_issue_id: issue_id,
            pieces: 2,
            reason: "Casse during transport".to_string(),
            actor_name: None,
        },
        Some("owner"),
    )
    .await
    .unwrap();
    let amount = validate_loss_declaration(&db, decl_id, Some("owner"))
        .await
        .unwrap();
    assert_eq!(amount, 2 * 3600, "Créance immédiate = 2 × 3600");

    // Validation impossible une seconde fois.
    let retry = validate_loss_declaration(&db, decl_id, Some("owner")).await;
    assert!(
        retry.is_err(),
        "La déclaration déjà validée doit être refusée"
    );

    let conv_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM packaging_conversions WHERE reason = 'loss' AND deposit_issue_id = ?",
    )
    .bind(issue_id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(conv_count, 1);

    let bal = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(bal.packaging_financial_balance, 7200);

    // À l'échéance (due_date désormais passée), seuls les 3 casiers restants sont convertis.
    sqlx::query("UPDATE deposit_issues SET due_date = date('now', '-1 day') WHERE id = ?")
        .bind(issue_id)
        .execute(&db.pool)
        .await
        .unwrap();
    let s = process_due_obligations(&db, None).await.unwrap();
    assert_eq!(s.total_amount, 3 * 3600);
}

#[tokio::test]
async fn test6_retour_tardif_apres_conversion_regularise() {
    // MAJ.md Test 6 : retour après conversion → contre-écriture, historique intact.
    let db = fresh_db("late").await;
    let (client_id, issue_id) = seed_fixture(&db).await;

    process_due_obligations(&db, Some("owner")).await.unwrap();
    let before = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(before.packaging_financial_balance, 18000);

    let credited = register_late_return(&db, issue_id, 2, Some("owner"))
        .await
        .unwrap();
    assert_eq!(credited, 2 * 3600, "Crédit = 2 × 3600");

    let after = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(after.packaging_financial_balance, 10800);

    // L'historique initial est intact.
    let conv: (i64, i64) = sqlx::query_as(
        "SELECT pieces, amount FROM packaging_conversions WHERE deposit_issue_id = ?",
    )
    .bind(issue_id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        conv,
        (5, 18000),
        "La conversion d'origine n'est pas modifiée"
    );
    let ledger_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_packaging_financial_ledger WHERE client_id = ?",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        ledger_count, 2,
        "Écriture de dette + contre-écriture, aucune suppression"
    );
}

#[tokio::test]
async fn test_obligations_listing_reflete_statut() {
    let db = fresh_db("list").await;
    let (client_id, _issue_id) = seed_fixture(&db).await;

    let obs = list_obligations(&db, Some(client_id)).await.unwrap();
    assert_eq!(obs.len(), 1);
    let o = &obs[0];
    assert_eq!(o.pending_pieces, 5);
    assert_eq!(o.total_reference_value, 18000);
    assert!(o.overdue, "Échéance passée → overdue");
    assert_eq!(o.status, "pending");
}

#[tokio::test]
async fn test_reglement_creance_emballages_et_dashboard_separe() {
    // PHASE 6 MAJ.md §11 : règlement du registre d'emballages, dashboard à soldes séparés.
    let db = fresh_db("pay").await;
    let (client_id, _issue_id) = seed_fixture(&db).await;

    // Avant conversion : dette commerciale (30 000 − 8 000 payé),
    // créance d'emballages 0, 5 pièces en attente (valeur indicative 18 000 NON exigible).
    // NB : seed_fixture ne crée pas de customer_receivable → dette commerciale 0 ici.
    let dash0 = get_client_packaging_dashboard(&db, client_id)
        .await
        .unwrap();
    assert_eq!(
        dash0.commercial_debt, 0,
        "Pas de receivable dans ce fixture"
    );
    assert_eq!(dash0.packaging_financial_debt, 0);
    assert_eq!(dash0.pending_pieces, 5);
    assert_eq!(dash0.pending_reference_value, 18_000);
    assert_eq!(
        dash0.total_financial_due, 0,
        "La valeur indicative n'est pas exigible"
    );

    // Échéance → conversion 18 000.
    process_due_obligations(&db, Some("owner")).await.unwrap();
    let dash1 = get_client_packaging_dashboard(&db, client_id)
        .await
        .unwrap();
    assert_eq!(dash1.packaging_financial_debt, 18_000);
    assert_eq!(dash1.total_financial_due, 18_000);
    assert_eq!(
        dash1.pending_pieces, 0,
        "Quantité convertie : plus d'obligation physique"
    );

    // Règlement partiel de la créance d'emballages : 10 000.
    let pay = pay_packaging_financial_debt(
        &db,
        PayPackagingDebtInput {
            client_id,
            parts: vec![PayPackagingPart {
                method_code: "cash".to_string(),
                amount: 10_000,
            }],
            request_key: "pay-pkg-1".to_string(),
            note: Some("Acompte casiers".to_string()),
        },
        Some("owner"),
    )
    .await
    .unwrap();
    assert_eq!(pay.packaging_financial_balance, 8_000);

    // Rejeu idempotent : même request_key → aucun double paiement.
    let pay2 = pay_packaging_financial_debt(
        &db,
        PayPackagingDebtInput {
            client_id,
            parts: vec![PayPackagingPart {
                method_code: "cash".to_string(),
                amount: 10_000,
            }],
            request_key: "pay-pkg-1".to_string(),
            note: None,
        },
        Some("owner"),
    )
    .await
    .unwrap();
    assert_eq!(pay2.packaging_financial_balance, 8_000, "Idempotent");

    // Solde commercial INTACT : le règlement d'emballages ne touche pas la dette marchandise.
    let dash2 = get_client_packaging_dashboard(&db, client_id)
        .await
        .unwrap();
    assert_eq!(
        dash2.commercial_debt, 0,
        "Dette commerciale inchangée (registres séparés)"
    );
    assert_eq!(dash2.packaging_financial_debt, 8_000);
    assert_eq!(dash2.total_financial_due, 8_000);

    // Trop-perçu refusé.
    let over = pay_packaging_financial_debt(
        &db,
        PayPackagingDebtInput {
            client_id,
            parts: vec![PayPackagingPart {
                method_code: "cash".to_string(),
                amount: 99_999,
            }],
            request_key: "pay-pkg-2".to_string(),
            note: None,
        },
        Some("owner"),
    )
    .await;
    assert!(
        over.is_err(),
        "Le règlement ne doit pas dépasser la créance"
    );

    let entries: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_packaging_financial_ledger WHERE client_id = ?",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(entries, 2, "charge + paiement, aucune suppression");
}

#[tokio::test]
async fn test_echeance_traitee_apres_redemarrage_application() {
    // MAJ.md PHASE 8 : les échéances doivent être traitées correctement après
    // fermeture puis réouverture de l'application (nouvelle connexion à la DB).
    let db_path = std::env::temp_dir().join(format!("pkg_obl_restart_{}.db", uuid::Uuid::new_v4()));

    // 1re "session" : création de l'obligation échue, aucune conversion.
    {
        let db = DepotDb::connect(&db_path).await.unwrap();
        let (client_id, issue_id) = seed_fixture(&db).await;
        assert_eq!(issue_id, 1);
        let bal = get_client_packaging_financial_balance(&db, client_id)
            .await
            .unwrap();
        assert_eq!(bal.packaging_financial_balance, 0);
        // Pas de traitement des échéances : l'app "se ferme".
    }

    // 2e "session" : reconnexion → la conversion à l'échéance doit fonctionner.
    {
        let db = DepotDb::connect(&db_path).await.unwrap();
        let s = process_due_obligations(&db, Some("owner")).await.unwrap();
        assert_eq!(s.conversions, 1, "Conversion après redémarrage");
        assert_eq!(s.total_amount, 18_000);

        // Rappel dans la même session : idempotent.
        let s2 = process_due_obligations(&db, None).await.unwrap();
        assert_eq!(s2.conversions, 0);
    }

    // 3e "session" : toujours idempotent après un nouveau redémarrage.
    {
        let db = DepotDb::connect(&db_path).await.unwrap();
        let s3 = process_due_obligations(&db, None).await.unwrap();
        assert_eq!(s3.conversions, 0, "Aucune double dette après redémarrage");
        let conv: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM packaging_conversions")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(conv, 1);
    }
    let _ = std::fs::remove_file(&db_path);
}

#[tokio::test]
async fn test_concurrence_double_conversion_simultanee() {
    // MAJ.md PHASE 8 : transactions concurrentes — deux traitements d'échéance
    // lancés en parallèle ne doivent créer qu'une seule dette.
    let db = fresh_db("conc").await;
    let (client_id, _issue_id) = seed_fixture(&db).await;

    let (r1, r2) = tokio::join!(
        process_due_obligations(&db, Some("owner")),
        process_due_obligations(&db, Some("owner"))
    );
    let s1 = r1.unwrap();
    let s2 = r2.unwrap();

    let total_conversions = s1.conversions + s2.conversions;
    let total_amount = s1.total_amount + s2.total_amount;
    assert_eq!(
        total_conversions, 1,
        "Une seule conversion malgré la concurrence"
    );
    assert_eq!(total_amount, 18_000, "Montant non doublé");

    let bal = get_client_packaging_financial_balance(&db, client_id)
        .await
        .unwrap();
    assert_eq!(bal.packaging_financial_balance, 18_000);
    let ledger_debits: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_packaging_financial_ledger
         WHERE entry_type = 'conversion_charge'",
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(ledger_debits, 1, "Une seule écriture de dette");
}
