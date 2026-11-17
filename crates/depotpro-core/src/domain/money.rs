use serde::{Deserialize, Serialize};
use crate::error::{CoreError, CoreResult};

/// Montant exact en FCFA entiers (XOF). Aucun float autorisé.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Money(pub i64);

impl Money {
    pub const ZERO: Self = Self(0);

    pub fn from_non_negative(amount: i64, label: &str) -> CoreResult<Self> {
        if amount < 0 {
            return Err(CoreError::Validation(format!(
                "{label} doit être un montant FCFA positif ou nul."
            )));
        }
        Ok(Self(amount))
    }

    pub fn from_positive(amount: i64, label: &str) -> CoreResult<Self> {
        if amount <= 0 {
            return Err(CoreError::Validation(format!(
                "{label} doit être un montant FCFA strictement positif."
            )));
        }
        Ok(Self(amount))
    }

    pub fn checked_add(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.0
            .checked_add(rhs.0)
            .map(Self)
            .ok_or_else(|| CoreError::Validation(format!("Débordement numérique FCFA sur {label}.")))
    }

    pub fn checked_sub(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.0
            .checked_sub(rhs.0)
            .map(Self)
            .ok_or_else(|| CoreError::Validation(format!("Débordement numérique FCFA sur {label}.")))
    }

    pub fn value(self) -> i64 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_fcfa_arithmetic() {
        let a = Money::from_positive(10_000, "Espèces").unwrap();
        let b = Money::from_positive(15_000, "Wave").unwrap();
        let c = Money::from_positive(25_000, "Orange Money").unwrap();
        let sum = a.checked_add(b, "ab").unwrap().checked_add(c, "abc").unwrap();
        assert_eq!(sum.value(), 50_000);
        assert!(Money::from_non_negative(-1, "test").is_err());
    }
}
