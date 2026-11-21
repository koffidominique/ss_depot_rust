// ============================================================================
// Handlers HTTP : Sauvegardes, chiffrement, vérification et restauration
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::infrastructure::backup;

use crate::dto::{EncryptedBackupPayload, ImportBackupPayload};
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn get_local_db_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, backup::inspect_local_db(&db, &state.backup_dir)).await {
        Ok(status) => (StatusCode::OK, Json(serde_json::to_value(status).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn import_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImportBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsCreate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        backup::import_backup_bytes(&db, &state.backup_dir, &payload.filename, &payload.bytes),
    )
    .await
    {
        Ok(dto) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(dto).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_backups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let dir = state.backup_dir.clone();
    match auth::with_actor(actor, async move { backup::list_backups(&dir) }).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsCreate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, backup::create_backup_summary(&db, &state.backup_dir)).await {
        Ok(summary) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(summary).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsCreate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        backup::create_encrypted_backup(&db, &state.backup_dir, &payload.passphrase),
    )
    .await
    {
        Ok(summary) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(summary).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn verify_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(actor, backup::verify_backup(&state.backup_dir, &name)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn verify_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::verify_encrypted_backup(&state.backup_dir, &name, &payload.passphrase),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn download_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let dir = state.backup_dir.clone();
    match auth::with_actor(actor, async move { backup::read_backup_bytes(&dir, &name) }).await {
        Ok((safe_name, bytes)) => {
            let disp = format!("attachment; filename=\"{safe_name}\"");
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            if let Ok(val) = HeaderValue::from_str(&disp) {
                resp_headers.insert(header::CONTENT_DISPOSITION, val);
            }
            (StatusCode::OK, resp_headers, bytes).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRestore).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::restore_and_reconnect(&state.db, &state.backup_dir, &name),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn restore_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRestore).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::restore_encrypted_backup_and_reconnect(
            &state.db,
            &state.backup_dir,
            &name,
            &payload.passphrase,
        ),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
