# MIGRATION DES DONNÉES V2 -> V3 & ÉVOLUTIONS DE SCHÉMA

## Règles de sécurité V2 -> V3

1. Ne jamais modifier la base V2 source en place (`?mode=ro`).
2. Toujours conserver une copie instantanée `.source_snapshot.db`.
3. Utiliser `Decimal` en Python (`scripts/migrate_v2_to_v3.py`) :
   - Tout montant non entier en FCFA est signalé dans le rapport d'anomalies (refusé en `--strict`).
   - Toute quantité dépassant 3 décimales est signalée (aucun arrondi silencieux).
4. Les références historiques (`VTE-*`, `FAC-*`, `PROD-*`) et les hachages `bcrypt` existants dans `owner_security` sont préservés tels quels.
5. `scripts/migrate_v2_to_v3.py` applique `0001_initial_v3.sql` puis l'ensemble des migrations SQLite séquentielles disponibles (`0002`..`0004`) et enregistre chaque version dans `schema_version`.
6. Vérifier obligatoirement `PRAGMA integrity_check = 'ok'` et `PRAGMA foreign_key_check` = 0 après migration.

## Règles d'évolution de schéma V3+

1. Ne jamais modifier arbitrairement une migration déjà appliquée en production (`0001_initial_v3.sql`, etc.).
2. Toute nouvelle évolution passe par un nouveau fichier numéroté dans `migrations/sqlite/` (`0005_*.sql`, ...), déclaré à l'identique dans `crates/depotpro-core/src/infrastructure/db.rs` et vérifié par la parité de schéma (`migrations/sqlite/expected_schema_v4.json`).
3. Chaque migration s'exécute dans sa propre transaction atomique `BEGIN IMMEDIATE ... COMMIT` et tolère les colonnes préexistantes sur d'anciennes bases V3 sans double `ALTER TABLE`.
