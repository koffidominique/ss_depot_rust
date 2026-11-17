# Dépannage (Troubleshooting) — DEPOTPRO PREMIUM V3

## 1. Connexion refusée / Verrouillage après 5 tentatives de PIN
- **Symptôme** : Erreur `429` ou message indiquant un blocage temporaire lors de la saisie du PIN.
- **Cause** : Protection anti-bruteforce : après 5 codes PIN erronés consécutifs, l'authentification est verrouillée pendant **30 secondes** (`lockedUntil` dans `auth_credentials`).
- **Solution** : Patienter 30 secondes puis saisir le code PIN propriétaire exact (6 chiffres). En cas de perte définitive du PIN sur un poste local, réinitialiser le champ `pin_hash` en base uniquement via une maintenance administrateur autorisée après sauvegarde préalable.

## 2. L'application Desktop refuse de démarrer (« Une autre instance est déjà en cours »)
- **Symptôme** : Refus d'ouverture au lancement de `DEPOTPRO ERP` avec mention du verrou `depotpro.lock`.
- **Cause** : Soit une fenêtre DEPOTPRO est déjà ouverte en arrière-plan, soit l'application a été interrompue brutalement (coupure de courant) sans déclencher `RunEvent::Exit`.
- **Solution** :
  1. Vérifier dans le Gestionnaire des tâches (Windows) ou le Moniteur d'activité (macOS) qu'aucun processus `depotpro` ne tourne encore.
  2. Vérifier le contenu du fichier `depotpro.lock` dans le répertoire de données (`%APPDATA%\com.depotpro.erp\` sous Windows ou `~/Library/Application Support/com.depotpro.erp/` sous macOS) et, s'il s'agit d'un ancien PID arrêté, supprimer `depotpro.lock` avant de relancer.

## 3. Erreur `SQLITE_BUSY` ou base verrouillée
- **Cause** : Un outil tiers (navigateur SQLite, sauvegarde manuelle, script externe) maintient un verrou exclusif sur `depotpro_v3.db` alors que `busy_timeout = 5000` est actif.
- **Solution** : Fermer tout outil externe inspectant `depotpro_v3.db`, puis relancer le serveur. Ne jamais copier le fichier `.db` à la main pendant que le serveur tourne : passer par l'écran **Sauvegardes** (`VACUUM INTO`).

## 4. Échec de restauration d'une sauvegarde
- **Symptôme** : Message « Sauvegarde corrompue ou incohérente : restauration refusée ».
- **Cause** : `verifyBackup` a détecté une anomalie lors de `PRAGMA integrity_check` ou `PRAGMA foreign_key_check`.
- **Solution** : La base active reste intacte. Sélectionner une sauvegarde précédente valide (notamment la pré-sauvegarde automatique créée avant chaque tentative).

## 5. Vente à crédit refusée pour un client
- **Symptôme** : Message `CREDIT_POLICY_VIOLATION` lors de la validation dans `SalesPage`.
- **Causes possibles** :
  - `policy = 'forbidden'` dans `client_credit_settings` sur la fiche client (`Clients` — défaut pour tout nouveau client).
  - `policy = 'blocked'` (client bloqué manuellement).
  - Pour `policy = 'limited'`, le nouveau solde dû (`solde actuel + montant à crédit`) dépasse `credit_limit`.
- **Solution** : Mettre à jour la politique de crédit (`forbidden` / `limited` / `unlimited` / `blocked`) dans **Clients**, enregistrer un encaissement partiel de créance dans **Créances**, ou solder l'achat au comptant.

## 6. `cargo` / `tauri` absent lors de la compilation desktop
- **Symptôme** : `rustc: command not found` ou erreur similaire.
- **Solution** : Dans un environnement Node/Linux conteneurisé sans toolchain Rust ni SDK Windows/macOS, exécuter le mode Web (`npm run dev` / `npm start`) et réserver `cargo build` / `npx tauri build` au poste cible équipé de Rust, WebView2 (Windows) ou Xcode CLI (macOS).

## 7. Référence `idempotence` / Double soumission
- Chaque formulaire critique génère une `request_key` unique par tentative. En cas de réponse `409 DUPLICATE_OPERATION` après une coupure réseau locale, rafraîchir l'historique (`Ventes`, `Achats` ou `Créances`) pour vérifier que la pièce a bien été enregistrée sans doublon.
