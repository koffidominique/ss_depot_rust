# SCHÉMA BASE DE DONNÉES V3 (`migrations/sqlite/0001_initial_v3.sql`)

## Invariants de stockage

- **Montants FCFA** : Toutes les colonnes monétaires sont `INTEGER` (FCFA entiers). Aucun `REAL` ou `FLOAT` n'est utilisé pour de l'argent.
- **Quantités** : Toutes les quantités sont exprimées en `INTEGER` `*_milli` (`1 unité = 1000 milli-unités`, précision maximale de 3 décimales).
- **Durabilité SQLite** :
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA synchronous = FULL`
  - `PRAGMA busy_timeout = 5000`
- **Transactions & Idempotence** :
  - Toute écriture multi-table passe par un verrou applicatif unique (`withWriteTx` / `begin_write`) sous `BEGIN IMMEDIATE`.
  - Les opérations critiques (`sales`, `payments`, `purchase_orders`, `purchase_receipts`, `cash_sessions`, `cash_movements`, `expenses`, `sales_cancellations`, `sales_returns`, `deposit_returns`) exigent un `request_key` unique.
- **Session de caisse** : Contrainte partielle unique `uq_cash_session_single_open` garantissant au plus une session `'open'`.
- **Immutabilité historique** : Aucun `ON DELETE CASCADE` sur les documents validés ; les annulations créent des contre-écritures (`sales_cancellations`, `sales_returns`, `stock_movements`).
