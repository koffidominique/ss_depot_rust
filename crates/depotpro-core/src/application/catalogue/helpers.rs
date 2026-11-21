// ============================================================================
// Helpers de désérialisation et vérification d'unicité pour le catalogue
// ============================================================================

use crate::error::{CoreError, CoreResult};

pub(crate) fn deserialize_opt_bool_or_int<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
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

        fn visit_some<D2: serde::Deserializer<'de>>(
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

pub(crate) async fn check_duplicate(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    code_field: &str,
    code: &str,
    exclude_id: Option<i64>,
) -> CoreResult<()> {
    let mut query = format!(
        "SELECT id FROM {} WHERE lower({}) = lower(?)",
        table, code_field
    );
    if exclude_id.is_some() {
        query.push_str(" AND id != ?");
    }
    let mut q = sqlx::query_scalar::<_, i64>(&query).bind(code);
    if let Some(id) = exclude_id {
        q = q.bind(id);
    }
    let exists: Option<i64> = q.fetch_optional(&mut **tx).await?;
    if exists.is_some() {
        return Err(CoreError::DuplicateOperation(format!(
            "Un(e) {} avec ce code existe déjà.",
            table
        )));
    }
    Ok(())
}
