# MIGRATION DES DONNÉES V2 -> V3

## Règles de sécurité

1. Ne jamais modifier la base V2 source en place (`?mode=ro`).
2. Toujours conserver une copie instantanée `.source_snapshot.db`.
3. Utiliser `Decimal` en Python (`scripts/migrate_v2_to_v3.py`) :
   - Tout montant non entier en FCFA est signalé dans le rapport d'anomalies (refusé en `--strict`).
   - Toute quantité dépassant 3 décimales est signalée (aucun arrondi silencieux).
4. Les références historiques (`VTE-*`, `FAC-*`, `PROD-*`) et les hachages `bcrypt` existants dans `owner_security` sont préservés tels quels.
5. Vérifier obligatoirement `PRAGMA integrity_check = 'ok'` et `PRAGMA foreign_key_check` = 0 après migration.
