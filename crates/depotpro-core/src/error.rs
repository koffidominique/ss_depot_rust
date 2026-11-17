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

    #[error("Erreur de base de données : {0}")]
    Database(String),

    #[error("Erreur interne : {0}")]
    Internal(String),
}

impl From<sqlx::Error> for CoreError {
    fn from(err: sqlx::Error) -> Self {
        CoreError::Database(err.to_string())
    }
}

pub type CoreResult<T> = Result<T, CoreError>;
