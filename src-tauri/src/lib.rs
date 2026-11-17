mod commands;
mod state;

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use tauri::{Manager, RunEvent};
use depotpro_core::infrastructure::db::DepotDb;
use state::DesktopState;

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
            let mut lock_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock_path)
                .map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::AlreadyExists,
                        "Une autre instance de DEPOTPRO ERP est déjà en cours d'exécution sur cette base.",
                    )
                })?;
            let _ = writeln!(lock_file, "pid={}", std::process::id());

            let db_path = app_data_dir.join("depotpro_v3.db");
            let backup_dir = app_data_dir.join("backups");

            let db = tauri::async_runtime::block_on(DepotDb::connect(&db_path))
                .expect("Échec initialisation SQLite DEPOTPRO");

            app.manage(DesktopState::new(db, backup_dir, lock_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth_status,
            commands::auth_setup_pin,
            commands::auth_login,
            commands::auth_lock,
            commands::change_owner_pin,
            commands::list_categories,
            commands::create_category,
            commands::list_products,
            commands::create_product,
            commands::update_product,
            commands::upsert_packaging,
            commands::export_products_csv,
            commands::import_products_csv,
            commands::list_clients,
            commands::create_client,
            commands::update_client_credit,
            commands::list_sales,
            commands::get_sale_detail,
            commands::create_sale,
            commands::cancel_sale,
            commands::create_sale_return,
            commands::list_receivables,
            commands::pay_receivable,
            commands::list_suppliers,
            commands::create_supplier,
            commands::list_purchases,
            commands::create_purchase_order,
            commands::receive_purchase_order,
            commands::list_supplier_debts,
            commands::pay_supplier_debt,
            commands::get_stock_overview,
            commands::list_inventories,
            commands::create_inventory,
            commands::validate_inventory,
            commands::get_consignments_overview,
            commands::create_returnable_type,
            commands::adjust_returnable_stock,
            commands::return_client_empties,
            commands::get_cash_status,
            commands::open_cash_session,
            commands::close_cash_session,
            commands::list_expenses,
            commands::create_expense,
            commands::get_dashboard,
            commands::get_reports,
            commands::get_settings,
            commands::update_settings,
            commands::add_payment_method,
            commands::toggle_payment_method,
            commands::list_backups,
            commands::create_backup,
            commands::verify_backup,
            commands::restore_backup,
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
