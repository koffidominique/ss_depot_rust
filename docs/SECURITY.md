# SÉCURITÉ DEPOTPRO V3

- **Propriétaire unique sans PIN par défaut** : Lors de l'initialisation, la table `owner_security` est vide ; l'utilisateur crée un code PIN à 6 chiffres haché avec `bcrypt`.
- **Verrouillage anti-bruteforce** : 5 tentatives erronées déclenchent un blocage de 30 secondes (`locked_until`).
- **Sessions authentifiées** : Toutes les routes `/api/*` (hors `/api/health`, `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/lock`) exigent un jeton Bearer valide.
- **Tauri 2** : Capabilities minimales (`src-tauri/capabilities/default.json`) sans permission shell globale ni accès fichier arbitraire, avec CSP stricte dans `tauri.conf.json`.
- **Serveur Node/Express & Axum** : Écoute par défaut sur `127.0.0.1` (`HOST` / `DEPOTPRO_HOST` et `PORT` configurables par environnement).
- **En-têtes HTTP & Protection CSRF (`server/app.ts` & `crates/depotpro-server/src/main.rs`)** : Désactivation de `X-Powered-By`, ajout systématique de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` sur `/api/*`, contrôle d'origine stricte (`localhost` / `127.0.0.1` / `DEPOTPRO_ALLOWED_ORIGINS`) sur les requêtes mutantes (`403 FORBIDDEN_ORIGIN`) et limitation de débit sur `/api/auth/{setup,login,change-pin}` (`429 RATE_LIMITED`).
- **Transparence SQLite** : Le code PIN protège l'accès applicatif mais ne chiffre pas le fichier SQLite brut ; les sauvegardes et répertoires de données doivent être protégés au niveau du poste.
