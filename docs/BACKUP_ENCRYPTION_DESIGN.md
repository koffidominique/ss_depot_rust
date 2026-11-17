# Conception Technique — Chiffrement des Sauvegardes (Lot 5.6)

**Statut :** Conception validée (à implémenter dans un lot dédié après validation croisée Windows / macOS)  
**Périmètre :** Archives de sauvegarde DEPOTPRO (`Sauvegardes/`)  
**Hors périmètre immédiat :** Chiffrement de la base SQLite active à chaud (traité séparément par migration contrôlée et prototype SQLCipher / VFS dédié).

---

## 1. Objectifs et contraintes multi-plateformes

DEPOTPRO PREMIUM V3 cible **Linux**, **macOS (Intel & Apple Silicon)** et **Windows 10/11 (MSVC)**.  
Un choix naïf (comme dépendre de `openssl-sys` dynamique ou compiler `SQLCipher` dans `sqlx` sans validation CI Windows/macOS) introduirait des risques élevés de rupture de compilation native sur postes clients ou CI.

**Principe retenu :** chiffrement au niveau de l'enveloppe d'archive produit après `VACUUM INTO` et vérification en lecture seule :
- **Côté Rust (`depotpro-core` / Tauri)** : primitives Rust pures/auditées sans dépendance C/OpenSSL système : `chacha20poly1305` (ou `aes-gcm`), `argon2`, `rand_core` (`OsRng`), `zeroize`, et stockage clé maître OS via `keyring` (Windows Credential Manager / DPAPI, macOS Keychain, Linux Secret Service).
- **Côté Node.js (`22+`)** : `node:crypto` natif supporte `aes-256-gcm` et `scrypt` / `crypto.argon2` sans aucune dépendance native supplémentaire.
- **Interopérabilité Node ↔ Rust** : en retenant **`AES-256-GCM`** (ou **`XChaCha20-Poly1305`** si unifiée des deux côtés) et **`Argon2id`**, la même archive produite sous Windows Tauri est déchiffrable sous macOS ou serveur Node/Axum. L'algorithme **`AES-256-GCM` + `Argon2id` (RFC 9106)** est privilégié pour sa compatibilité native immédiate dans Node `node:crypto`, WebCrypto et les crates RustCrypto (`aes-gcm`, `argon2`) sous Windows MSVC et macOS.

---

## 2. Algorithme moderne authentifié (AEAD)

- **Chiffrement authentifié** : `AES-256-GCM` (clé 256 bits, nonce aléatoire CSPRNG 96 bits unique par archive, tag d'authentification GHASH 128 bits).
  - Chaque sauvegarde génère une **DEK** (*Data Encryption Key*) aléatoire de 256 bits (`OsRng`) et un **nonce** 96 bits unique : aucune réutilisation de couple `(clé, nonce)` n'est possible même en cas de restaurations répétées.
- **Données associées authentifiées (AAD)** : l'en-tête JSON complet (`magic`, `format_version`, `cipher_id`, `kdf_id`, `created_at`, `schema_version`, `plaintext_sha256`, `salt`) est passé en AAD lors du chiffrement et du déchiffrement AEAD.

---

## 3. Format binaire versionné de l'archive

Extension proposée pour les archives chiffrées : `depotpro_backup_YYYYMMDDHHMMSS_<suffix>.dpbkp` (ou `.db.enc`).

```
+-------------------------------------------------------------------+
| Magic (8 octets)          : "DPBKP01\0"                           |
| Format version (u16 LE)   : 0x0001                                |
| Header length (u32 LE)    : N octets                              |
| Header JSON UTF-8 (N o.)  : {                                     |
|   "v": 1,                                                         |
|   "cipher": "aes-256-gcm",                                        |
|   "kdf": "argon2id",                                              |
|   "kdfParams": { "mCostKiB": 65536, "tCost": 3, "pCost": 1 },     |
|   "saltB64": "...",         // 16 octets aléatoires               |
|   "nonceB64": "...",        // 12 octets aléatoires               |
|   "wrappedDekB64": "...",   // optionnel (mode KEK/passphrase)    |
|   "schemaVersion": 4,                                             |
|   "minAppVersion": "3.0.0",                                       |
|   "createdAt": "2026-11-17T...",                                  |
|   "plaintextSha256": "..."                                        |
| }                                                                 |
| Ciphertext                : SQLite binaire chiffré (streaming/blocs)|
| Tag AEAD (16 octets)      : Tag AES-256-GCM sur Ciphertext + AAD  |
+-------------------------------------------------------------------+
```

> **Note gros volumes :** pour les bases dépassant 64 Mo, le flux sera découpé en **chunks de 4 Mio** (`AES-256-GCM` par chunk avec dérivation de nonce déterministe `base_nonce || chunk_index` et drapeau `is_final` dans l'AAD) afin d'éviter la troncature, le réordonnancement ou l'allocation complète en RAM.

---

## 4. Gestion sécurisée des clés & procédure de récupération

1. **Architecture à deux niveaux (KEK / DEK)** :
   - **Clé maître locale (KEK)** stockée dans le trousseau sécurisé du système :
     - Windows : Windows Credential Manager / DPAPI.
     - macOS : Apple Keychain.
     - Linux : Secret Service (`libsecret`) ou secret explicitement fourni par l'administrateur en mode headless.
   - **Clé d'archive (DEK)** : générée aléatoirement par archive, enveloppée (*Key Wrapping*) par la KEK ou dérivée de la phrase secrète administrateur via `Argon2id`.
2. **Procédure de récupération obligatoire** :
   - Lors de l'activation du chiffrement des sauvegardes, DEPOTPRO génère une **Clé de Récupération Maître** (256 bits encodés en 24 mots BIP-39 ou clé hexadécimale formatée avec somme de contrôle SHA-256).
   - L'utilisateur confirme la copie/impression hors machine avant activation définitive (`setup_encryption`).
   - En cas de perte du poste ou réinstallation OS (trousseau local absent), l'écran de restauration permet d'importer `.dpbkp` en saisissant soit le mot de passe administrateur, soit la Clé de Récupération Maître, puis de re-vérifier l'archive en fichier temporaire isolé (sans jamais exposer le clair SQLite persistant hors du staging éphémère immédiatement nettoyé).
   - Les clés en mémoire sont effacées après usage (`zeroize::Zeroize`).

---

## 5. Protection contre les altérations & vérifications

1. **Authentification avant toute lecture SQLite** : le tag GCM/Poly1305 valide l'intégralité de l'en-tête AAD et des octets chiffrés. Un seul bit modifié provoque l'échec cryptographique immédiat avant tout déchiffrement sur disque.
2. **Double vérification d'intégrité** : après déchiffrement vers un fichier temporaire sécurisé (permissions restrictives `0600`), le SHA-256 du fichier clair est comparé à `plaintextSha256` puis le moteur existant `verify_backup_path_read_only` valide `PRAGMA integrity_check`, `foreign_key_check` et compatibilité `schema_version`.
3. **Protection chemin / lien symbolique** : les mêmes contrôles `resolve_safe_backup_path` (liste blanche de nommage, interdiction `..`/symlinks, confinement canonique) s'appliquent aux fichiers `.dpbkp`.

---

## 6. Compatibilité des sauvegardes anciennes

- **Détection automatique par magic bytes** :
  - `b"SQLite format 3\0"` → archive **V3 historique non chiffrée (`format_version = 0`)** : lecture, vérification en lecture seule et restauration restent 100 % prises en charge, avec mention explicite `encrypted: false` dans l'API et l'interface.
  - `b"DPBKP01\0"` → archive **V3 chiffrée (`format_version = 1`)** : vérification par déchiffrement authentifié + ouverture lecture seule en staging temporaire effacé dans un bloc `finally` / `Drop`.
- **Base SQLite principale** : le chiffrement complet de la base active (`depotpro_v3.db`) sera traité séparément par un prototype dédié validant la compilation croisée (`windows-latest`, `macos-latest`, `ubuntu-latest`) et un plan de migration contrôlée sans perte de données.
