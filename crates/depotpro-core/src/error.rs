use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum CoreError {
    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    Unauthorized(String),

    #[error("{0}")]
    Forbidden(String),

    #[error("{0}")]
    RateLimited(String),

    #[error("{0}")]
    InsufficientStock(String),

    #[error("{0}")]
    CreditPolicyViolation(String),

    #[error("{0}")]
    SessionNotOpen(String),

    #[error("{0}")]
    SessionAlreadyOpen(String),

    #[error("{0}")]
    HistoricalImmutable(String),

    #[error("{0}")]
    InvalidPayment(String),

    #[error("{0}")]
    DuplicateOperation(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    DatabaseBusy(String),

    #[error("Erreur de base de données : {0}")]
    Database(String),

    #[error("Erreur interne : {0}")]
    Internal(String),
}

pub fn is_sqlite_busy_error(err: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db_err) = err {
        if matches!(
            db_err.code().as_deref(),
            Some("5") | Some("261") | Some("517")
        ) {
            return true;
        }
        let msg = db_err.message().to_ascii_lowercase();
        if msg.contains("database is locked") || msg.contains("database table is locked") {
            return true;
        }
    }
    let text = err.to_string().to_ascii_lowercase();
    text.contains("database is locked") || text.contains("sqlite_busy")
}

impl From<sqlx::Error> for CoreError {
    fn from(err: sqlx::Error) -> Self {
        if is_sqlite_busy_error(&err) {
            return CoreError::DatabaseBusy(
                "Base de données temporairement occupée par une autre opération (SQLITE_BUSY). Réessayez dans un instant."
                    .to_string(),
            );
        }
        CoreError::Database(err.to_string())
    }
}

pub type CoreResult<T> = Result<T, CoreError>;
