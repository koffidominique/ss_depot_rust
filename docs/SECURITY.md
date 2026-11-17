# SÉCURITÉ DEPOTPRO V3

- **Propriétaire unique sans PIN par défaut** : Lors de l'initialisation, la table `owner_security` est vide ; l'utilisateur crée un code PIN à 6 chiffres haché avec `bcrypt`.
- **Verrouillage anti-bruteforce** : 5 tentatives erronées déclenchent un blocage de 30 secondes (`locked_until`).
- **Sessions authentifiées** : Toutes les routes `/api/*` (hors `/api/health`, `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/lock`) exigent un jeton Bearer valide.
- **Tauri 2** : Capabilities minimales (`src-tauri/capabilities/default.json`) sans permission shell globale ni accès fichier arbitraire, avec CSP stricte dans `tauri.conf.json`.
- **Serveur Axum** : Écoute limitée à `127.0.0.1` (localhost uniquement).
- **Transparence SQLite** : Le code PIN protège l'accès applicatif mais ne chiffre pas le fichier SQLite brut ; les sauvegardes et répertoires de données doivent être protégés au niveau du poste.
