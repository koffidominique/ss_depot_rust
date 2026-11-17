# AUDIT PHASE 0 — Dépôt Source `depot_python`

- **Dépôt inspecté** : `https://github.com/koffidominique/depot_python.git`
- **Commit inspecté** : `78d9555` (`Merge pull request #2 from koffidominique/arena/be170884-depot-python`)

## Constats techniques et risques identifiés

1. **Coexistence legacy vs `managed_*`** :
   L'ancien projet Python a conservé deux générations de modèles en parallèle (`Sale` vs `ManagedSale`, `Debt` vs `Receivable`, `CashSession` vs `ManagedCashSession`), créant une complexité de maintenance et des risques d'écritures partielles si des routes legacy restaient exposées.
2. **Types `NUMERIC` / `float` historiques** :
   Certaines anciennes tables utilisaient des colonnes `NUMERIC(12, 3)` exposées via `float`/`Decimal` SQLAlchemy. L'audit interne `docs/AUDIT_TECHNIQUE.md` signalait explicitement que la migration Alembic historique était incomplète et potentiellement destructive.
3. **Chaîne de migrations personnalisée (`depotpro_schema_migrations`, v1 à v20)** :
   Le projet reposait sur des migrations incrémentales jusqu'à v20 couvrant : caisse gérée, annulations, profils de crédit client explicites (`forbidden` / `limited` / `unlimited`), retours partiels (`credit_notes`), profils d'emballages consignés et moyens de paiement versionnés.

## Matrice de correspondance V2 -> V3

| Module source Python | Cible V3 | État dans V3 |
| --- | --- | --- |
| `models/product.py`, `services/product_service.py` | `server/services/catalog.ts` & `crates/depotpro-core/src/application/products.rs` | Repris avec `stock_milli` exact et 5 conditionnements |
| `models/managed_sale.py`, `services/sales_service.py` | `server/services/sales.ts` | Repris : atomique, contre-écritures, retours/avoirs, consignes |
| `models/client.py`, `client_credit_profiles` | `clients` + `client_credit_settings` | Crédit interdit par défaut, plafond explicite |
| `models/purchase.py`, `services/purchase_service.py` | `server/services/purchases.ts` | Commande != stock, réceptions partielles, CUMP, dettes |
| `models/cash.py`, `services/cash_service.py` | `server/services/finance.ts` | Séparation stricte espèces vs digital |
| `models/returnable.py`, `deposit_*` | `server/services/consignments.ts` | Stock vides, comptes clients, retours bon état/cassé |
| `services/backup_service.py` | `server/services/reports.ts` & `crates/depotpro-core/src/infrastructure/backup.rs` | `VACUUM INTO` + `PRAGMA integrity_check` |
| `pages/*.py` (NiceGUI) | `src/pages/*.tsx` (React 19 + Tailwind + Radix) | 17 écrans complets Light/Dark |
