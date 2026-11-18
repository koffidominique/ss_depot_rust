# SÉCURITÉ DEPOTPRO V3

## 1. Authentification, verrouillage PIN & protection anti-concurrence

- **Propriétaire unique sans PIN par défaut** : Lors de l'initialisation, la table `owner_security` est vide ; le premier démarrage exige la création d'un code PIN à 6 chiffres haché avec `bcrypt`.
- **Comptes multi-opérateurs (`users`, migration `0005`)** : Le propriétaire et les administrateurs peuvent créer des comptes secondaires (`username`, `displayName`, `role`, PIN `bcrypt` 6 chiffres) et les activer/désactiver.
- **Verrouillage anti-bruteforce atomique (`BEGIN IMMEDIATE`)** :
  - `5` tentatives erronées déclenchent un blocage de `30` secondes (`locked_until`).
  - La lecture de `failed_attempts` et son incrément/verrouillage s'exécutent de manière atomique à l'intérieur d'une transaction d'écriture exclusive (`withWriteTx` en Node, `db.begin_write()` en Rust) après vérification `bcrypt`, empêchant toute perte d'incrément ou contournement lors de tentatives simultanées.
- **Limitation de débit réseau** : `/api/auth/setup`, `/api/auth/login` et `/api/auth/change-pin` appliquent un rate-limiter par IP (25 requêtes / 60s, statut HTTP `429`).

## 2. Sessions avec expiration temporelle (Node, Axum & Tauri)

Les deux moteurs maintiennent un stockage de session structuré (`SessionStore` côté Rust/Axum/Tauri, `activeSessions` côté Node) contenant pour chaque jeton :

- Jeton opaque aléatoire (64 caractères hexadécimaux / 256 bits),
- `createdAt`, `lastActivityAt`, `expiresAt`,
- `identity` (`userId`, `username`, `displayName`, `role`, `roleLabel`, `permissions`),
- `revoked` (drapeau de révocation explicite).

Politique uniforme :
- **Expiration d'inactivité** : `30` minutes par défaut (`DEPOTPRO_SESSION_IDLE_SECS`).
- **Durée maximale de session** : `12` heures par défaut (`DEPOTPRO_SESSION_MAX_SECS`).
- **Révocation** : immédiate lors du verrouillage (`POST /api/auth/lock` / `auth_lock`), lors d'un changement de PIN propriétaire (autres sessions révoquées) et lors de la désactivation d'un utilisateur (`set_user_active(..., false)` / `setUserActive(..., false)`).
- **Nettoyage & validation** : purge des sessions expirées et validation temporelle à chaque requête protégée ou commande Tauri.

## 3. Contrôle des origines HTTP & configuration proxy (Axum & Express)

- **Écoute locale stricte** : les serveurs HTTP Node et Axum écoutent sur `127.0.0.1` par défaut (`DEPOTPRO_HOST` configurable).
- **Comparaison stricte d'origine (RFC 3986)** : sur toute requête mutante (`POST`, `PUT`, `PATCH`, `DELETE`) munie d'un en-tête `Origin`, les moteurs extraient et valident le triplet `(scheme, host, port)` sans userinfo ni fragment ni query. Les contournements par préfixe (`http://127.0.0.1.evil.com`, `http://localhost:3000.evil.com`) ou userinfo (`http://user@localhost:3000`) sont rejetés (`403 FORBIDDEN_ORIGIN`).
- **En-têtes proxy opt-in uniquement (`DEPOTPRO_TRUST_PROXY=true`)** : `X-Forwarded-Host` et `X-Forwarded-For` sont strictement ignorés par défaut. L'extraction d'adresse client côté Axum utilise le `ConnectInfo<SocketAddr>` réel du socket TCP sauf configuration proxy explicite.
- **En-têtes de sécurité HTTP** : `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` sur `/api/*`, désactivation `X-Powered-By`.

## 4. Contrôle d'accès par rôles (RBAC — 6 rôles & 26 permissions)

Rôles supportés :

1. `owner` (**Propriétaire**) : toutes les permissions (`ALL`).
2. `admin` (**Administrateur**) : toutes les permissions sauf `security:change_owner_pin`.
3. `manager` (**Responsable**) : opérations commerciales, stocks, consignations, caisse, rapports, création de sauvegardes (`backups:create`), sans modification paramètres système ni gestion des comptes/restauration.
4. `cashier` (**Caissier**) : lecture catalogue, ventes/retours, créances, caisse, dépenses, consignations ; bloqué sur stocks/achats/paramètres/sauvegardes/comptes (`403 FORBIDDEN`).
5. `stock_manager` (**Gestionnaire de stock**) : catalogue, approvisionnements, ajustements stocks, inventaires, consignations ; bloqué sur ventes/caisse/rapports/paramètres/sauvegardes/comptes (`403 FORBIDDEN`).
6. `accountant` (**Comptable**) : lecture seule transverse (ventes, créances, achats, stocks, consignations, caisse, rapports, liste/vérification/téléchargement de sauvegardes) ; bloqué sur toute mutation.

**Double barrière systématique** :
- Chaque endpoint Express/Axum et chaque commande Tauri vérifie la permission avant d'entrer dans le service métier.
- Chaque fonction métier (`crates/depotpro-core/src/application/*`, `server/services/*`) re-vérifie la permission via `require_current_actor_permission` (`tokio::task_local!` côté Rust) / `requireCurrentActorPermission` (`AsyncLocalStorage` côté Node).
- Toutes les écritures dans `audit_logs` enregistrent `actor_user_id`, `actor_name` et `actor_role`.

## 5. Sauvegardes chiffrées (`.dpbkp`) & stockage local

- Les sauvegardes peuvent être chiffrées de manière authentifiée avec **AES-256-GCM + PBKDF2-HMAC-SHA256 (100 000 itérations)** au format unifié `DPBKP01\0` (interopérable Node ↔ Rust/Tauri, détail dans `docs/DATA_ENCRYPTION_STUDY.md`).
- La base SQLite active locale n'est pas chiffrée au niveau fichier brut afin de garantir compatibilité Node `node:sqlite`, Rust `sqlx` et compilation multi-OS Windows/macOS ; le chiffrement disque OS (BitLocker / FileVault / LUKS) reste recommandé sur le poste d'exploitation.
- **Tauri 2** : capabilities minimales (`src-tauri/capabilities/default.json`) sans permission shell globale ni accès fichier arbitraire, avec CSP stricte dans `tauri.conf.json`.
