# Étude de Compatibilité & Chiffrement des Données — DEPOTPRO V3 (Lot 6.5)

**Date :** 2026-11-17  
**Périmètre :** Base SQLite principale, fichiers de sauvegarde, pièces justificatives, documents exportés et procédure de migration non destructive.

---

## 1. Contraintes techniques multi-moteurs & multi-OS

DEPOTPRO V3 repose sur une architecture hybride partageant exactement le même fichier SQLite :
- **Moteur Node.js 22+** (`node:sqlite` / `DatabaseSync`, serveur web Express) ;
- **Moteur Rust / Tauri 2** (`sqlx = 0.8.6` avec `libsqlite3-sys`, binaire Axum et application desktop Windows MSVC / macOS / Linux).

Toute solution cryptographique doit donc :
1. Compiler sans dépendance C/OpenSSL fragile sous **Windows 10/11 (MSVC)**, **macOS (Intel & Apple Silicon)** et **Linux** ;
2. Être **100 % interopérable octet pour octet** entre Node (`node:crypto`) et Rust (crates pure-Rust `aes-gcm`, `pbkdf2`, `hmac`, `sha2`).

---

## 2. Analyse par surface de données

### 2.1. Base SQLite principale (`depotpro_v3.db`)

| Option étudiée | Compatibilité Node `node:sqlite` | Compatibilité Rust `sqlx 0.8` (Win/macOS) | Performance & WAL | Décision |
| :--- | :--- | :--- | :--- | :--- |
| **SQLCipher intégré (`sqlcipher_export`)** | Non supporté nativement par `node:sqlite` (`DatabaseSync` embarque SQLite standard sans extension SQLCipher) | Conflit de liaison C `libsqlite3-sys` avec `sqlx-sqlite`, compilation OpenSSL requise sous Windows MSVC | Bon si compilé partout | **Différé** : incompatibilité native `node:sqlite` + risque build Windows/macOS |
| **Enveloppe chiffrée au repos + VFS/déchiffrement session** | Nécessite stockage temporaire clair pendant exécution ou extension native | Complexité élevée sur crash OS (risque fichier temporaire orphelin) | Moyen | **Rejeté pour la base active** |
| **Chiffrement disque OS (BitLocker / FileVault / LUKS) + RBAC + Sauvegardes AES-256-GCM** | Native (transparente) | Native (transparente) | Native WAL complète | **Retenu en production V3** jusqu'à disponibilité d'un driver SQLite3MC/SQLCipher unifié |

**Conclusion base principale :** l'activation du chiffrement SQLite à chaud sur `depotpro_v3.db` est conditionnée à un prototype CI vérifiant la compilation Windows MSVC + macOS + un pont commun Node/Rust. En V3, la confidentialité au repos hors poste est assurée par le format chiffré `.dpbkp`, et sur le poste par le verrouillage RBAC/PIN et le chiffrement volume OS.

### 2.2. Fichiers de sauvegarde (`Sauvegardes/*.dpbkp`) — Prototype fonctionnel implémenté

Implémenté dans **les deux moteurs** (`server/services/reports.ts` et `crates/depotpro-core/src/infrastructure/backup.rs`) avec parité binaire exacte :

- **Format** : `DPBKP01\0` (8 octets) + `version u16 LE (1)` + `header_len u32 LE` + en-tête JSON UTF-8 + `ciphertext` + tag `AES-256-GCM` (16 octets).
- **Primitif AEAD** : `AES-256-GCM` (clé 256 bits, nonce aléatoire 96 bits par sauvegarde, en-tête JSON complet authentifié en **AAD**).
- **Dérivation de clé (KDF)** : `PBKDF2-HMAC-SHA256` (`100 000` itérations, sel aléatoire 128 bits par fichier, clé de chiffrement >= 8 caractères).
- **Vérification d'intégrité** :
  1. Validation cryptographique du tag AEAD (rejet immédiat sur mauvaise clé ou 1 bit altéré) ;
  2. Contrôle `sha256` post-déchiffrement (`plaintextSha256`) ;
  3. Écriture dans un fichier temporaire éphémère automatiquement nettoyé par `try/finally` (Node) / garde RAII `TempFileCleanup` (Rust) ;
  4. Vérification `PRAGMA integrity_check`, `PRAGMA foreign_key_check` et `schema_version` en lecture seule avant toute acceptation.

### 2.3. Pièces justificatives (`expenses.receipt_path`) & Photos produits (`products.image_path`)

- Stockage actuel : Data URL contrôlées (`image/png`, `image/jpeg`, `image/webp`) bornées à `350 000` caractères dans SQLite (aucun fichier libre hors base susceptible de diverger lors d'une sauvegarde `VACUUM INTO`).
- Avantage : toute sauvegarde chiffrée `.dpbkp` protège automatiquement **100 %** des justificatifs de dépenses et photos sans fichier orphelin ni fuite sur disque.
- Évolution future si stockage externe activé : chiffrement par blob `AES-256-GCM` avec clé dérivée par enregistrement et nettoyage sécurisé.

### 2.4. Documents exportés (PDF & CSV)

- Les exports CSV et PDF sont générés à la demande en mémoire (`generate_document_pdf`, `export_products_csv`) uniquement pour les rôles autorisés (`catalog:read`, `sales:read`, `purchases:read`, `cash:read`), puis envoyés via flux binaire sans création de cache persistant côté serveur (`Cache-Control: no-store`).
- Recommandation d'exploitation : avertir les utilisateurs lors d'exports sur supports partagés ; option de mot de passe PDF/ZIP exploitable en lot ultérieur sans modification du schéma.

---

## 3. Plan de migration non destructive & sécurité de récupération

Pour toute bascule future vers une base SQLite principale chiffrée :
1. **Pré-requis bloquant** : création et vérification (`verify_backup_path_read_only` + `verify_encrypted_backup`) d'une sauvegarde `.dpbkp` complète sur support distinct avant toute conversion.
2. **Conversion par export contrôlé (`VACUUM INTO` / ré-import)** : jamais de modification en place irréversible du fichier source ; la base convertie est écrite dans un fichier temporaire distinct, vérifiée (`integrity_check`, `foreign_key_check`, comptage des 14 entités), puis substituée atomiquement avec conservation d'un fichier rollback.
3. **Compatibilité ascendante** : le lecteur de sauvegardes détecte automatiquement l'en-tête (`SQLite format 3\0` vs `DPBKP01\0`), assurant que les archives V3 non chiffrées restent vérifiables et restaurables sans conversion destructrice.
