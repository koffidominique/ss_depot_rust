// ============================================================================
// Désérialiseurs tolérants et validation des chemins d'images locaux
// ============================================================================

use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Deserializer};

pub(crate) fn deserialize_nullable_opt<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

pub(crate) fn deserialize_qty_str<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    struct QtyVisitor;
    impl<'de> serde::de::Visitor<'de> for QtyVisitor {
        type Value = String;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("une quantité sous forme de chaîne ou de nombre")
        }

        fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_string<E: serde::de::Error>(self, v: String) -> Result<String, E> {
            Ok(v)
        }

        fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<String, E> {
            if !v.is_finite() {
                return Err(E::custom("Nombre invalide."));
            }
            Ok(v.to_string())
        }
    }
    deserializer.deserialize_any(QtyVisitor)
}

pub(crate) fn deserialize_opt_qty_str<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptQtyVisitor;
    impl<'de> serde::de::Visitor<'de> for OptQtyVisitor {
        type Value = Option<String>;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("une quantité optionnelle sous forme de chaîne, de nombre ou null")
        }

        fn visit_none<E: serde::de::Error>(self) -> Result<Option<String>, E> {
            Ok(None)
        }

        fn visit_unit<E: serde::de::Error>(self) -> Result<Option<String>, E> {
            Ok(None)
        }

        fn visit_some<D2: Deserializer<'de>>(
            self,
            deserializer: D2,
        ) -> Result<Option<String>, D2::Error> {
            deserialize_qty_str(deserializer).map(Some)
        }
    }
    deserializer.deserialize_option(OptQtyVisitor)
}

pub(crate) fn deserialize_opt_bool_or_int<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptBoolVisitor;
    impl<'de> serde::de::Visitor<'de> for OptBoolVisitor {
        type Value = Option<bool>;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("un booléen optionnel ou 0/1")
        }

        fn visit_none<E: serde::de::Error>(self) -> Result<Option<bool>, E> {
            Ok(None)
        }

        fn visit_unit<E: serde::de::Error>(self) -> Result<Option<bool>, E> {
            Ok(None)
        }

        fn visit_some<D2: Deserializer<'de>>(
            self,
            deserializer: D2,
        ) -> Result<Option<bool>, D2::Error> {
            struct Inner;
            impl<'de> serde::de::Visitor<'de> for Inner {
                type Value = bool;

                fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                    f.write_str("un booléen ou 0/1")
                }

                fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<bool, E> {
                    Ok(v)
                }

                fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<bool, E> {
                    Ok(v != 0)
                }

                fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<bool, E> {
                    Ok(v != 0)
                }
            }
            deserializer.deserialize_any(Inner).map(Some)
        }
    }
    deserializer.deserialize_option(OptBoolVisitor)
}

pub(crate) fn sanitize_image_path(raw: Option<&str>) -> CoreResult<Option<String>> {
    let Some(val) = raw else {
        return Ok(None);
    };
    let trimmed = val.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 350_000 {
        return Err(CoreError::Validation(
            "L'image est trop volumineuse (max 250 Ko).".to_string(),
        ));
    }
    let lower = trimmed.to_ascii_lowercase();
    let is_safe_data_uri = (lower.starts_with("data:image/png;base64,")
        || lower.starts_with("data:image/jpeg;base64,")
        || lower.starts_with("data:image/jpg;base64,")
        || lower.starts_with("data:image/webp;base64,"))
        && trimmed
            .split_once(";base64,")
            .map(|(_, b64)| {
                !b64.is_empty()
                    && b64
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
            })
            .unwrap_or(false);
    let is_safe_rel = trimmed.starts_with("/images/")
        && !trimmed.contains("..")
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '_' | '-'));

    if !is_safe_data_uri && !is_safe_rel {
        return Err(CoreError::Validation(
            "Format d'image invalide (utilisez PNG, JPEG ou WebP local).".to_string(),
        ));
    }
    Ok(Some(trimmed.to_string()))
}
