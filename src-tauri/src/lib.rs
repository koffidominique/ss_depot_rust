// ============================================================================
// Point d'entrée bibliothèque Desktop Tauri — verrou d'instance & IPC
// ============================================================================

mod commands;
mod state;

use depotpro_core::infrastructure::db::DepotDb;
use state::DesktopState;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use tauri::{Manager, RunEvent};

fn is_pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

fn acquire_single_instance_lock(lock_path: &std::path::Path) -> std::io::Result<()> {
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(lock_path)
    {
        Ok(mut f) => {
            let _ = writeln!(f, "pid={}", std::process::id());
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            let stale = std::fs::read_to_string(lock_path)
                .ok()
                .and_then(|s| {
                    s.lines()
                        .find_map(|l| l.strip_prefix("pid="))
                        .and_then(|v| v.trim().parse::<u32>().ok())
                })
                .map(|pid| pid != std::process::id() && !is_pid_alive(pid))
                .unwrap_or(false);
            if stale {
                let _ = std::fs::remove_file(lock_path);
                let mut f = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(lock_path)?;
                let _ = writeln!(f, "pid={}", std::process::id());
                return Ok(());
            }
            Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "Une autre instance de DEPOTPRO ERP est déjà en cours d'exécution sur cette base.",
            ))
        }
        Err(e) => Err(e),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./data"));
            std::fs::create_dir_all(&app_data_dir)
                .expect("Impossible de créer le répertoire de données applicatives DEPOTPRO");

            // Verrou d'instance unique (Partie 20) : empêche deux processus d'accéder simultanément à la base SQLite
            let lock_path = app_data_dir.join("depotpro.lock");
            acquire_single_instance_lock(&lock_path)?;

            let db_path = app_data_dir.join("depotpro_v3.db");
            let backup_dir = app_data_dir.join("backups");

            let db = tauri::async_runtime::block_on(DepotDb::connect(&db_path))
                .expect("Échec initialisation SQLite DEPOTPRO");

            app.manage(DesktopState::new(db, backup_dir, lock_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_status,
            commands::auth::auth_setup_pin,
            commands::auth::auth_login,
            commands::auth::auth_me,
            commands::auth::auth_lock,
            commands::auth::change_owner_pin,
            commands::auth::auth_list_users,
            commands::auth::auth_create_user,
            commands::auth::auth_toggle_user,
            commands::products::list_categories,
            commands::products::create_category,
            commands::products::update_category,
            commands::products::list_products,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::delete_product,
            commands::products::upsert_packaging,
            commands::products::export_products_csv,
            commands::products::import_products_csv,
            commands::sales::list_clients,
            commands::sales::create_client,
            commands::sales::update_client,
            commands::sales::update_client_credit,
            commands::sales::list_sales,
            commands::sales::get_sale_detail,
            commands::sales::create_sale,
            commands::sales::cancel_sale,
            commands::sales::create_sale_return,
            commands::cash_and_reports::list_receivables,
            commands::cash_and_reports::pay_receivable,
            commands::purchases_and_stock::list_suppliers,
            commands::purchases_and_stock::create_supplier,
            commands::purchases_and_stock::update_supplier,
            commands::purchases_and_stock::list_purchases,
            commands::purchases_and_stock::create_purchase_order,
            commands::purchases_and_stock::receive_purchase_order,
            commands::purchases_and_stock::cancel_purchase_order,
            commands::purchases_and_stock::list_supplier_debts,
            commands::purchases_and_stock::pay_supplier_debt,
            commands::purchases_and_stock::get_stock_overview,
            commands::purchases_and_stock::adjust_stock,
            commands::purchases_and_stock::list_inventories,
            commands::purchases_and_stock::create_inventory,
            commands::purchases_and_stock::validate_inventory,
            commands::consignments_and_obligations::get_consignments_overview,
            commands::consignments_and_obligations::create_returnable_type,
            commands::consignments_and_obligations::adjust_returnable_stock,
            commands::consignments_and_obligations::return_client_empties,
            commands::consignments_and_obligations::list_packaging_obligations,
            commands::consignments_and_obligations::get_packaging_dashboard,
            commands::consignments_and_obligations::pay_packaging_debt,
            commands::catalogue_v3::set_catalogue_product_active_pc,
            commands::catalogue_v3::set_catalogue_reference_price_pc,
            commands::catalogue_v3::get_catalogue_reference_price_history_pc,
            commands::cash_and_reports::get_cash_status,
            commands::cash_and_reports::open_cash_session,
            commands::cash_and_reports::close_cash_session,
            commands::cash_and_reports::list_expenses,
            commands::cash_and_reports::create_expense,
            commands::cash_and_reports::get_dashboard,
            commands::cash_and_reports::get_reports,
            commands::cash_and_reports::get_settings,
            commands::cash_and_reports::update_settings,
            commands::cash_and_reports::add_payment_method,
            commands::cash_and_reports::toggle_payment_method,
            commands::cash_and_reports::generate_document_pdf,
            commands::backups::list_backups,
            commands::backups::create_backup,
            commands::backups::create_encrypted_backup,
            commands::backups::verify_backup,
            commands::backups::verify_encrypted_backup,
            commands::backups::download_backup,
            commands::backups::restore_backup,
            commands::backups::restore_encrypted_backup,
            commands::backups::shutdown_app,
            commands::packaging_components::get_packaging_components_overview,
            commands::packaging_components::list_crate_components_pc,
            commands::packaging_components::create_crate_component_pc,
            commands::packaging_components::get_packaging_stock,
            commands::packaging_components::update_component_stock_pc,
            commands::packaging_components::assemble_crates_pc,
            commands::packaging_components::disassemble_crates_pc,
            commands::packaging_components::list_bottle_profiles_pc_cmd,
            commands::packaging_components::create_bottle_profile_pc,
            commands::packaging_components::list_crate_types_pc_cmd,
            commands::packaging_components::create_crate_type_pc,
            commands::partial_returns_and_validation::get_partial_returns_overview_pc,
            commands::partial_returns_and_validation::create_partial_return_pc,
            commands::partial_returns_and_validation::list_pending_partial_returns_pc,
            commands::partial_returns_and_validation::create_pending_partial_return_pc,
            commands::partial_returns_and_validation::update_pending_partial_return_pc,
            commands::partial_returns_and_validation::get_pos_validation_config_pc,
            commands::partial_returns_and_validation::update_pos_validation_config_pc,
            commands::partial_returns_and_validation::validate_sale_compatibility_pc,
            commands::partial_returns_and_validation::list_compatibility_rules_pc,
            commands::partial_returns_and_validation::create_compatibility_rule_pc,
            commands::catalogue_v3::get_product_catalogue_overview_pc,
            commands::catalogue_v3::create_catalogue_brand_pc,
            commands::catalogue_v3::create_catalogue_family_pc,
            commands::catalogue_v3::create_catalogue_unit_pc,
            commands::catalogue_v3::create_catalogue_product_pc,
            commands::catalogue_v3::list_catalogue_products_pc,
            commands::catalogue_v3::initialize_catalogue_pc,
            commands::catalogue_v4::list_breweries,
            commands::catalogue_v4::create_brewery,
            commands::catalogue_v4::list_brands_v4,
            commands::catalogue_v4::create_brand_v4,
            commands::catalogue_v4::list_container_types_v4,
            commands::catalogue_v4::list_packaging_types_v4,
            commands::catalogue_v4::list_stock_locations_v4,
            commands::catalogue_v4::list_sales_units_v4,
            commands::catalogue_v4::create_sales_unit_v4,
            commands::catalogue_v4::update_sales_unit_v4,
            commands::catalogue_v4::delete_sales_unit_v4,
            commands::catalogue_v4::list_product_suppliers_v4,
            commands::catalogue_v4::upsert_product_supplier_v4,
            commands::catalogue_v4::list_deposit_rules_v4,
            commands::orders::compose_order_preview_v4,
            commands::orders::list_orders_v4,
            commands::orders::get_order_v4,
            commands::orders::create_order_v4,
            commands::orders::confirm_order_v4,
            commands::orders::deliver_order_v4,
            commands::orders::invoice_order_v4,
            commands::orders::pay_order_v4,
            commands::orders::cancel_order_v4,
            commands::orders::return_order_packaging_v4,
            commands::orders::list_packaging_assets_v4,
            commands::orders::get_customer_deposits_v4,
            commands::orders::return_customer_deposits_v4,
        ])
        .build(tauri::generate_context!())
        .expect("Erreur fatale au démarrage de DEPOTPRO Desktop");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<DesktopState>() {
                let _ = std::fs::remove_file(&state.lock_path);
            }
        }
    });
}
