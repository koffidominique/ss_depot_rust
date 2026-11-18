# Rapport de Remédiation — LOT 6 : Sécurité et Authentification

**Statut :** Implémenté et vérifié (tests Node/API/UI + suite Rust dédiée + étude chiffrement)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Date :** 2026-11-17

---

## 1. Synthèse des correctifs livrés

### 1.1. Sessions Rust & Node avec expiration et révocation (`6.1`)
- **`crates/depotpro-core/src/application/auth.rs`** : remplacement du stockage par jetons simples par `SessionStore` stockant `token`, `created_at`, `last_activity_at`, `expires_at`, `identity` (`SessionIdentity`) et `revoked`.
- **`src-tauri/src/{state,commands,lib}.rs`** & **`crates/depotpro-server/src/main.rs`** : adoption de `SessionStore` avec validation et mise à jour de dernière activité sur chaque appel protégé, expiration par inactivité (`30 min` par défaut, `DEPOTPRO_SESSION_IDLE_SECS`), durée maximale absolue (`12 h`, `DEPOTPRO_SESSION_MAX_SECS`), purge des sessions expirées et révocation au verrouillage, au changement de PIN ou à la désactivation d'un compte.
- **`server/services/auth.ts`** : parité exacte (`verifyTokenAndTouch`, `purgeExpiredSessions`, `revokeUserSessions`, `DEPOTPRO_SESSION_IDLE_{MS,SECS}`, `DEPOTPRO_SESSION_MAX_{MS,SECS}`).

### 1.2. Tentatives PIN concurrentes atomiques (`6.2`)
- **Rust (`verify_owner_pin`, `verify_user_login`)** : lecture de `failed_attempts` et `locked_until` ré-exécutée à l'intérieur de la transaction exclusive `BEGIN IMMEDIATE` (`db.begin_write()`), garantissant l'incrément séquentiel exact jusqu'au verrouillage (`5` tentatives -> blocage `30s`) sans écrasement sous charge concurrente.
- **Node (`loginUser` / `loginOwner`)** : correction critique assurant la persistance atomique (`COMMIT`) du compteur `failed_attempts` et de `locked_until` dans `withWriteTx` même lorsque l'authentification retourne `401 UNAUTHORIZED` ou `429 PIN_LOCKED`.

### 1.3. Contrôle strict des origines HTTP & configuration proxy (`6.3`)
- **`crates/depotpro-server/src/main.rs`** & **`server/app.ts`** : remplacement des tests par préfixe par une validation stricte `(scheme, host, port)` (`parse_origin` / `parseStrictOrigin`) rejetant les contournements (`http://127.0.0.1.evil.com`, `http://localhost:3000.evil.com`, `user@...`).
- **`DEPOTPRO_TRUST_PROXY`** : `X-Forwarded-Host` et `X-Forwarded-For` sont ignorés par défaut ; Axum s'appuie sur `ConnectInfo<SocketAddr>` et Express désactive `trust proxy` sauf activation explicite `DEPOTPRO_TRUST_PROXY=true`. L'écoute par défaut reste `127.0.0.1`.

### 1.4. Gestion des rôles RBAC & traçabilité d'audit (`6.4`)
- **Migration `migrations/sqlite/0005_security_roles_users.sql`** (`CURRENT_SCHEMA_VERSION = 5`, `expected_schema_v5.json`) : ajout de la table `users` (`owner`, `admin`, `manager`, `cashier`, `stock_manager`, `accountant`) et des colonnes `audit_logs.actor_{user_id,name,role}`.
- **26 permissions granulaires** contrôlées aux **deux niveaux** :
  1. Entrée API (`crates/depotpro-server/src/main.rs`, `server/app.ts`) et commandes Tauri (`src-tauri/src/commands.rs`) ;
  2. Services métier (`tokio::task_local!` `ACTOR_CONTEXT` côté Rust, `AsyncLocalStorage` `ActorContext` côté Node) via `require_current_actor_permission` / `requireCurrentActorPermission`.
- **Traçabilité** : toute écriture `audit_logs` capture automatiquement `actor_user_id`, `actor_name` et `actor_role`.
- **UI & API unifiée** :
  - Nouveaux endpoints `/api/auth/me`, `/api/auth/users`, `/api/auth/users/:id/status` et commandes Tauri `auth_me`, `auth_list_users`, `auth_create_user`, `auth_toggle_user`.
  - Écran de connexion avec identifiant opérateur optionnel (`owner` par défaut), badge opérateur dans `Header.tsx`, et gestion des comptes/rôles dans `SettingsPage.tsx`.

### 1.5. Chiffrement des données & sauvegardes `.dpbkp` (`6.5`)
- Implémentation croisée pure-Rust (`aes-gcm`, `pbkdf2`, `hmac`, `sha2`, `base64`) et Node (`node:crypto`) du format versionné **`DPBKP01\0`** (`AES-256-GCM` + `PBKDF2-HMAC-SHA256` 100 000 itérations, en-tête authentifié en AAD, `TempFileCleanup` RAII, vérification en lecture seule et restauration contrôlée).
- Nouveaux endpoints/commandes `/api/backups/encrypted`, `/api/backups/:name/verify-encrypted`, `/api/backups/:name/restore-encrypted` (`create_encrypted_backup`, `verify_encrypted_backup`, `restore_encrypted_backup`) + interface utilisateur dans `BackupsPage.tsx`.
- Étude complète publiée dans `docs/DATA_ENCRYPTION_STUDY.md` et mise à jour de `docs/SECURITY.md` et `docs/DATABASE.md`.

---

## 2. Couverture de tests et vérifications

- **`tests/lot6_security.test.mjs`** (5 suites couvrant les 14 cas exigés : session idle/max TTL, révocation lock & désactivation compte, absence/expiration de token, 8 tentatives PIN concurrentes, verrouillage/déverrouillage, origines spoofées & proxy opt-in, matrice 6 rôles + `audit_logs.actor_*`, chiffrement/vérification/restauration `.dpbkp`).
- **`crates/depotpro-core/tests/lot6_security.rs`** + **`crates/depotpro-core/src/infrastructure/backup.rs` tests** + **`crates/depotpro-server/src/main.rs` tests** (sessions `SessionStore`, attaque PIN concurrente Tokio, RBAC 6 rôles, audit acteur, HTTP Axum origines/RBAC/révocation, AES-256-GCM `.dpbkp`).
- **`tests/ui.test.mjs`** (scénario multi-utilisateur `LoginPage`, création sauvegarde chiffrée `BackupsPage`, création opérateur RBAC `SettingsPage`) & **`tests/contracts.test.mjs`** (parité `ApiClient` / `HttpApiClient` / `TauriApiClient` / Express / Axum).
- **`tests/lot4_migrations.test.mjs`** & **`crates/depotpro-core/tests/lot4_migrations.rs`** alignés sur `expected_schema_v5.json` (`versions 1..5`).
