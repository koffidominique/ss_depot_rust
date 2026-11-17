# Sauvegarde et Restauration — DEPOTPRO PREMIUM V3

## Principes d'intégrité

SQLite fonctionne en mode `WAL` (`PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;`). Une copie brute du fichier `.db` à chaud risquerait d'omettre des pages non encore rapatriées depuis le fichier `-wal`. DEPOTPRO V3 n'effectue donc jamais de simple copie à chaud :

1. **Sérialisation sur la file d'écriture** (`runSerialized` en Node / `db.lock_write().await` en Rust) pour garantir qu'aucune transaction n'est ouverte simultanément.
2. **Checkpoint WAL complet** : `PRAGMA wal_checkpoint(TRUNCATE);` rapatrie les journaux et réinitialise le WAL.
3. **Snapshot autonome** : `VACUUM INTO '<chemin_sauvegarde>'` produit un fichier `.db` compacté, cohérent et indépendant.
4. **Contrôle automatique post-création** : la sauvegarde nouvellement produite est immédiatement ouverte en lecture seule avec `PRAGMA integrity_check` (`ok` obligatoire).
5. **Rétention automatique** : après validation de la nouvelle sauvegarde, les archives les plus anciennes au-delà des **30 dernières sauvegardes** (`MAX_RETAINED_BACKUPS = 30`, Node & Rust) sont automatiquement purgées.

## Emplacement des sauvegardes

- **Serveur Node/Express (`server/db.ts`)** : par défaut `<DATA_DIR>/Sauvegardes` (c.-à-d. `data/Sauvegardes`), surchargeable par la variable d'environnement `DEPOTPRO_BACKUP_DIR`.
- **Desktop Tauri 2 (`src-tauri/src/lib.rs`)** : `<app_data_dir>/backups` (répertoire applicatif utilisateur OS, hors dossier d'installation).
- **Nommage** : `depotpro_backup_YYYYMMDDHHMMSS_<suffixe>.db`.

## Vérification d'une sauvegarde

Avant toute restauration (ou à la demande depuis **Sauvegardes** -> `Vérifier`), `verifyBackup(filename)` exécute en lecture seule :
- `PRAGMA integrity_check` -> doit retourner `ok`
- `PRAGMA foreign_key_check` -> doit retourner `0` erreur
- `SELECT MAX(version) FROM schema_version` -> vérifie la présence et le niveau du schéma V3.

## Procédure de restauration (`server/services/reports.ts`)

Lors d'une restauration depuis l'écran **Sauvegardes** (`POST /api/backups/:name/restore`) :
1. Vérification préalable (`integrity_check == 'ok'` et `foreignKeyErrors == 0`) — toute sauvegarde invalide est refusée avant modification.
2. **Pré-sauvegarde automatique** de la base courante avant remplacement (`await createBackup()`).
3. Fermeture propre de la connexion SQLite active (`closeDb()`).
4. Suppression des fichiers auxiliaires `-wal` et `-shm` de l'ancienne base.
5. Copie du fichier vérifié vers `DB_PATH`, puis réouverture (`reloadDb()`).

## Bonnes pratiques d'exploitation

- Effectuer une sauvegarde avant chaque mise à jour de l'application ou migration V2 -> V3.
- Copier régulièrement les fichiers `depotpro_backup_*.db` du dossier `Sauvegardes` vers un support externe (clé USB chiffrée ou disque externe hors site).
- Ne jamais ouvrir ou copier manuellement la base active pendant qu'une instance de DEPOTPRO est ouverte ; sous Tauri Desktop, le verrou `depotpro.lock` empêche l'ouverture concurrente de la même base.
