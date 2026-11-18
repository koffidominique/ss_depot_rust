use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};

/// Montant exact en FCFA entiers (XOF). Aucun float autorisé.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Money(pub i64);

impl Money {
    pub const ZERO: Self = Self(0);

    pub fn from_i64(amount: i64) -> Self {
        Self(amount)
    }

    pub fn from_i128(amount: i128, label: &str) -> CoreResult<Self> {
        i64::try_from(amount)
            .map(Self)
            .map_err(|_| CoreError::Validation(format!("Débordement numérique FCFA sur {label}.")))
    }

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

    pub fn ensure_non_negative(self, label: &str) -> CoreResult<Self> {
        Self::from_non_negative(self.0, label)
    }

    pub fn ensure_positive(self, label: &str) -> CoreResult<Self> {
        Self::from_positive(self.0, label)
    }

    pub fn checked_add(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.0.checked_add(rhs.0).map(Self).ok_or_else(|| {
            CoreError::Validation(format!("Débordement numérique FCFA sur {label}."))
        })
    }

    pub fn checked_sub(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.0.checked_sub(rhs.0).map(Self).ok_or_else(|| {
            CoreError::Validation(format!("Débordement numérique FCFA sur {label}."))
        })
    }

    pub fn checked_sub_non_negative(self, rhs: Self, label: &str) -> CoreResult<Self> {
        let diff = self.checked_sub(rhs, label)?;
        diff.ensure_non_negative(label)
    }

    pub fn checked_mul(self, factor: i64, label: &str) -> CoreResult<Self> {
        let prod = (self.0 as i128) * (factor as i128);
        Self::from_i128(prod, label)
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
        let sum = a
            .checked_add(b, "ab")
            .unwrap()
            .checked_add(c, "abc")
            .unwrap();
        assert_eq!(sum.value(), 50_000);
        assert_eq!(Money::from_non_negative(0, "nul").unwrap().value(), 0);
        assert!(Money::from_positive(0, "strict").is_err());
        assert!(Money::from_non_negative(-1, "test").is_err());
        assert_eq!(
            Money(1_500).checked_mul(24, "consigne").unwrap().value(),
            36_000
        );
        assert!(Money(i64::MAX).checked_add(Money(1), "overflow").is_err());
        assert!(Money(i64::MAX / 2).checked_mul(4, "mul_overflow").is_err());
        assert!(Money(100)
            .checked_sub_non_negative(Money(200), "neg_diff")
            .is_err());
        assert_eq!(
            Money(100)
                .checked_sub(Money(200), "signed_diff")
                .unwrap()
                .value(),
            -100
        );
    }
}
