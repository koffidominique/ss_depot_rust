// ============================================================================
// Handlers HTTP : Caisse, créances, dépenses, rapports, PDF & paramètres
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{cash, pdf, reports};

use crate::dto::{AddPaymentMethodPayload, ReportQuery, TogglePaymentMethodPayload};
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Caisse, créances & dépenses
// ----------------------------------------------------------------------------

pub(crate) async fn cash_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::get_cash_status(&db)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn open_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::OpenCashInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashOperate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::open_cash_session(&db, payload)).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn close_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CloseCashInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashOperate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::close_cash_session(&db, payload)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_receivables(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReceivablesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::list_receivables(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn pay_receivable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<cash::PayReceivableInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReceivablesPay).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::pay_receivable(&db, id, payload)).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_expenses(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::list_expenses(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_expense(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CreateExpenseInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ExpensesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::create_expense(&db, payload)).await {
        Ok(exp) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(exp).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Rapports, PDF, paramètres & moyens de paiement
// ----------------------------------------------------------------------------

pub(crate) async fn reports_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReportQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReportsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        reports::get_reports_overview(&db, q.from.as_deref(), q.to.as_deref()),
    )
    .await
    {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::get_settings_bundle(&db)).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<reports::UpdateSettingsInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::update_settings(&db, payload)).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn add_payment_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AddPaymentMethodPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::add_payment_method(&db, &payload.label)).await {
        Ok(pm) => (StatusCode::CREATED, Json(serde_json::to_value(pm).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn toggle_payment_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(payload): Json<TogglePaymentMethodPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        reports::toggle_payment_method(&db, &code, payload.active),
    )
    .await
    {
        Ok(pm) => (StatusCode::OK, Json(serde_json::to_value(pm).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn generate_document_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<pdf::DocumentPdfInput>,
) -> impl IntoResponse {
    let needed = match payload.doc_type.as_str() {
        "BON_COMMANDE" | "BON_RECEPTION" => Permission::PurchasesRead,
        "CLOTURE_CAISSE" => Permission::CashRead,
        _ => Permission::SalesRead,
    };
    let actor = match require_perm(&state, &headers, needed).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, pdf::generate_document_pdf(&db, payload)).await {
        Ok((filename, bytes)) => {
            let disp = format!("attachment; filename=\"{filename}\"");
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/pdf"),
            );
            if let Ok(val) = HeaderValue::from_str(&disp) {
                resp_headers.insert(header::CONTENT_DISPOSITION, val);
            }
            (StatusCode::OK, resp_headers, bytes).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}
