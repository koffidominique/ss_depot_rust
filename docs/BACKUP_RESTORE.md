# Sauvegarde et Restauration — DEPOTPRO PREMIUM V3

## Principes d'intégrité

SQLite fonctionne en mode `WAL` (`PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;`). Une copie brute du fichier `.db` à chaud risquerait d'omettre des pages non encore rapatriées depuis le fichier `-wal`. DEPOTPRO V3 n'effectue donc jamais de simple copie à chaud :

1. **Sérialisation sur la file d'écriture** (`runSerialized` en Node / `db.lock_write().await` en Rust) pour garantir qu'aucune transaction n'est ouverte simultanément.
2. **Checkpoint WAL complet** : `PRAGMA wal_checkpoint(TRUNCATE);` rapatrie les journaux et réinitialise le WAL.
3. **Snapshot autonome** : `VACUUM INTO '<chemin_sauvegarde>'` produit un fichier `.db` compacté, cohérent et indépendant, puis `sync_all()` / `fsyncSync()` synchronise l'archive sur disque.
4. **Contrôle automatique post-création en lecture seule** : la sauvegarde nouvellement produite est immédiatement ouverte via `open_backup_read_only` (`read_only = true`, `create_if_missing = false`, `PRAGMA query_only = ON`) — aucune migration ni sidecar WAL/SHM n'est créé.
5. **Rétention automatique** : après validation de la nouvelle sauvegarde, les archives les plus anciennes au-delà des **30 dernières sauvegardes** (`MAX_RETAINED_BACKUPS = 30`, Node & Rust) sont automatiquement purgées (liens symboliques et fichiers hors format strict ignorés).

## Sécurisation des chemins et nommage

- **Emplacement Node/Express (`server/db.ts`)** : `<DATA_DIR>/Sauvegardes` (ou `DEPOTPRO_BACKUP_DIR`).
- **Emplacement Desktop Tauri 2 (`src-tauri/src/lib.rs`)** : `<app_data_dir>/backups`.
- **Nommage autorisé strict** : `^depotpro_backup_\d{14}_[a-zA-Z0-9_-]{1,32}\.db$`.
- **Protection contre la traversée et les liens symboliques (`resolve_safe_backup_path` / `resolveSafeBackupPath`)** :
  - Rejet immédiat de `/`, `\`, `..`, octets nuls et espaces.
  - Refus explicite des liens symboliques (`symlink_metadata` / `lstatSync`).
  - Vérification de confinement canonique (`canonicalize` / `realpathSync`) à l'intérieur du dossier de sauvegarde résolu.

## Vérification en lecture seule et compatibilité

Avant toute restauration (ou via **Sauvegardes** -> `Vérifier`), `verify_backup` / `verifyBackup` ouvre le fichier **strictement en lecture seule** (sans modifier un seul octet — empreinte **SHA-256** identique avant/après) et contrôle :
1. En-tête magique `SQLite format 3\0` et taille valide.
2. `PRAGMA integrity_check` == `ok`.
3. `PRAGMA foreign_key_check` == `0` erreur.
4. Présence des tables obligatoires DEPOTPRO (`schema_version`, `app_settings`, `products`, `sales`, `cash_sessions`, etc.).
5. Compatibilité du schéma : `1 <= schema_version <= 4` et cohérence des colonnes de migration (`logo_path`, `receipt_path`, `setup_completed`).
6. Calcul des compteurs des 14 entités métier et empreinte SHA-256.

Toute archive corrompue ou incompatible (ex. schéma futur `> 4` ou base étrangère sans tables DEPOTPRO) est refusée avant restauration.

## Procédure de restauration atomique et résilience (11 étapes)

Lors d'une restauration (`POST /api/backups/:name/restore` / Tauri `restore_backup`) :
1. Vérifier l'archive source en lecture seule (`integrity == 'ok'`, `foreignKeyErrors == 0`, `compatible == true`).
2. Créer une **sauvegarde de sécurité** de la base active (`VACUUM INTO`).
3. Vérifier cette sauvegarde de sécurité en lecture seule.
4. Copier l'archive source vers un fichier temporaire `.depotpro_restore_tmp_*.db` sur le **même système de fichiers** que la base active, synchroniser (`fsync`) et vérifier son SHA-256 + intégrité + compatibilité en lecture seule avant toute fermeture du pool actif.
5. Exécuter `PRAGMA wal_checkpoint(TRUNCATE)` puis **fermer proprement** le pool / la connexion SQLite active.
6. Supprimer les anciens fichiers `-wal`, `-shm` et `-journal`, puis déplacer l'ancienne base vers un fichier de repli `.depotpro_restore_prev_*.db` sur le même système de fichiers.
7. Effectuer le **remplacement atomique** (`rename` temporaire → base active) et synchroniser (`fsync` fichier + répertoire parent sous Unix).
8. Reconnecter SQLite (`DepotDb::connect` / `reloadDb`), en appliquant si besoin les migrations v1..v3 → v4.
9. Exécuter la **vérification post-restauration** (`integrity_check`, `foreign_key_check`, enregistrement `RESTORE_BACKUP` dans `audit_logs`, contrôle des 14 tables métier : produits, mouvements de stock, clients, fournisseurs, ventes, retours, paiements créances, achats, réceptions, paiements fournisseurs, consignations, mouvements de caisse, dépenses, audit).
10. Supprimer le fichier de repli `.depotpro_restore_prev_*.db` (la sauvegarde de sécurité dans `Sauvegardes/` reste conservée).
11. **Récupération sur échec** : si une erreur ou interruption survient après fermeture du pool (étapes 5 à 9), l'ancienne base est rétablie depuis `.depotpro_restore_prev_*.db` (ou la sauvegarde de sécurité) et le pool SQLite est immédiatement rouvert afin de ne jamais laisser l'application avec un pool définitivement fermé.

## Chiffrement des sauvegardes

Voir la conception détaillée dans [`docs/BACKUP_ENCRYPTION_DESIGN.md`](BACKUP_ENCRYPTION_DESIGN.md).
