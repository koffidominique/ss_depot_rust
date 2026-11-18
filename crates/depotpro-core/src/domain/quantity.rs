use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};

/// Quantité exacte en milli-unités (1 unité = 1000 milli-unités, max 3 décimales).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Quantity {
    pub milli_units: i64,
}

impl Quantity {
    pub const ZERO: Self = Self { milli_units: 0 };

    /// Parse une chaîne décimale (ex: "12.5" ou "12,500") sans jamais passer par f64.
    pub fn parse_str(input: &str, label: &str) -> CoreResult<Self> {
        let clean = input.trim().replace(',', ".");
        if clean.is_empty() || clean.starts_with('-') || clean.starts_with('+') {
            return Err(CoreError::Validation(format!("{label} invalide.")));
        }
        let parts: Vec<&str> = clean.split('.').collect();
        if parts.len() > 2 {
            return Err(CoreError::Validation(format!(
                "{label} : format numérique invalide."
            )));
        }
        if parts[0].is_empty() || !parts[0].chars().all(|c| c.is_ascii_digit()) {
            return Err(CoreError::Validation(format!(
                "{label} : partie entière invalide."
            )));
        }
        let int_part: i64 = parts[0]
            .parse()
            .map_err(|_| CoreError::Validation(format!("{label} : partie entière invalide.")))?;
        let frac_str = if parts.len() == 2 {
            let f = parts[1];
            if f.is_empty() || f.len() > 3 || !f.chars().all(|c| c.is_ascii_digit()) {
                return Err(CoreError::Validation(format!(
                    "{label} : maximum 3 décimales autorisées sans arrondi silencieux."
                )));
            }
            f
        } else {
            ""
        };
        let padded = format!("{frac_str:0<3}");
        let frac_part: i64 = padded.parse().unwrap_or(0);
        let milli = int_part
            .checked_mul(1000)
            .and_then(|v| v.checked_add(frac_part))
            .ok_or_else(|| CoreError::Validation(format!("Débordement sur {label}.")))?;
        Ok(Self { milli_units: milli })
    }

    pub fn parse_positive_str(input: &str, label: &str) -> CoreResult<Self> {
        let q = Self::parse_str(input, label)?;
        if q.milli_units <= 0 {
            return Err(CoreError::Validation(format!(
                "{label} doit être strictement positive."
            )));
        }
        Ok(q)
    }

    pub fn from_milli(milli_units: i64) -> Self {
        Self { milli_units }
    }

    pub fn checked_add(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.milli_units
            .checked_add(rhs.milli_units)
            .map(Self::from_milli)
            .ok_or_else(|| CoreError::Validation(format!("Débordement de quantité sur {label}.")))
    }

    pub fn checked_sub(self, rhs: Self, label: &str) -> CoreResult<Self> {
        self.milli_units
            .checked_sub(rhs.milli_units)
            .map(Self::from_milli)
            .ok_or_else(|| CoreError::Validation(format!("Débordement de quantité sur {label}.")))
    }

    /// Convertit une quantité conditionnée en unité de base (milli * coeff_milli / 1000) en i128.
    pub fn multiply_coefficient_to_base(self, coefficient: Self) -> CoreResult<Self> {
        if self.milli_units < 0 || coefficient.milli_units <= 0 {
            return Err(CoreError::Validation(
                "Quantité ou coefficient de conditionnement invalide.".to_string(),
            ));
        }
        let prod = (self.milli_units as i128) * (coefficient.milli_units as i128);
        if prod % 1000 != 0 {
            return Err(CoreError::Validation(
                "La conversion en unité de base dépasse 3 décimales (arrondi refusé).".to_string(),
            ));
        }
        let res = prod / 1000;
        let milli = i64::try_from(res)
            .map_err(|_| CoreError::Validation("Débordement de quantité convertie.".to_string()))?;
        Ok(Self { milli_units: milli })
    }

    /// Calcule le total exact de ligne = quantité_milli * prix_unitaire_fcfa / 1000.
    pub fn compute_line_fcfa(self, unit_price_fcfa: i64) -> CoreResult<i64> {
        if self.milli_units < 0 || unit_price_fcfa < 0 {
            return Err(CoreError::Validation(
                "Quantité ou prix unitaire négatif refusé.".to_string(),
            ));
        }
        let prod = (self.milli_units as i128) * (unit_price_fcfa as i128);
        if prod % 1000 != 0 {
            return Err(CoreError::Validation(
                "Le montant de ligne ne correspond pas à un nombre entier de FCFA.".to_string(),
            ));
        }
        i64::try_from(prod / 1000)
            .map_err(|_| CoreError::Validation("Débordement montant de ligne.".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_milli_conversions() {
        let q = Quantity::parse_str("10", "Cmd").unwrap();
        let coeff = Quantity::from_milli(24_000);
        let base = q.multiply_coefficient_to_base(coeff).unwrap();
        assert_eq!(base.milli_units, 240_000); // 240 bouteilles

        assert!(Quantity::parse_str("1.2345", "Précision").is_err());
        assert!(Quantity::parse_str("1.", "Point final").is_err());
        assert!(Quantity::parse_str(".5", "Sans zéro").is_err());
        assert!(Quantity::parse_str("+1", "Plus").is_err());
        assert!(Quantity::parse_str("-1", "Négatif").is_err());
        assert!(Quantity::parse_positive_str("0", "Zéro").is_err());
        assert_eq!(Quantity::parse_str("0.5", "Demi").unwrap().milli_units, 500);
        assert_eq!(
            Quantity::parse_str("0,5", "Virgule").unwrap().milli_units,
            500
        );

        // Fraction valide donnant un FCFA entier : 0.5 * 500 = 250 FCFA
        assert_eq!(
            Quantity::from_milli(500).compute_line_fcfa(500).unwrap(),
            250
        );
        // Fraction donnant une fraction de FCFA refusée sans arrondi : 0.333 * 100 = 33.3 FCFA
        assert!(Quantity::from_milli(333).compute_line_fcfa(100).is_err());
        // Débordement refusé
        assert!(Quantity::from_milli(i64::MAX)
            .compute_line_fcfa(2_000)
            .is_err());
    }
}
