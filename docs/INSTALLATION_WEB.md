# Installation & Démarrage Web — DEPOTPRO PREMIUM V3

## Prérequis

- **Node.js `>= 22.0`** (utilise le module natif `node:sqlite` / `DatabaseSync`) et `npm`.
- **Navigateur moderne** (Chromium, Firefox, Edge ou Safari récent) pour l'interface React et l'impression PDF.
- *(Optionnel — pour le binaire serveur Rust)* : Toolchain Rust stable (`rustc`, `cargo`) et compilateur C de la plateforme.

## 1. Mode Node.js + Express + Vite (Runtime principal fourni)

### Installation des dépendances
```bash
npm install
```

### Variables d'environnement optionnelles
- `PORT` : port HTTP d'écoute (défaut `3000`).
- `DEPOTPRO_DB_PATH` : chemin du fichier SQLite V3 (défaut `./data/depotpro_v3.db`).
- `DEPOTPRO_BACKUP_DIR` : répertoire des sauvegardes (défaut `<dossier_DB>/Sauvegardes`).

### Démarrage en développement
```bash
npm run dev
```
Le serveur démarre sur `http://127.0.0.1:3000`, applique automatiquement `migrations/sqlite/0001_initial_v3.sql` si la base n'existe pas encore, et initialise les données de référence minimales (`payment_methods`, `app_settings`).

### Build et démarrage en production
```bash
npm run build
NODE_ENV=production npm start
```
`npm run build` génère les assets frontend dans `dist/`, puis `npm start` (`node server.ts`) sert simultanément l'API `/api/*` et le bundle statique `dist/` sur le port `3000`.

### Premier accès
Aucun code PIN par défaut n'est préconfiguré. À la première ouverture, l'écran de configuration demande la création du **code PIN propriétaire à 6 chiffres**.

## 2. Mode Serveur Rust Axum (`crates/depotpro-server`, poste équipé Rust)

Sur une machine disposant de `rustc` et `cargo` :
```bash
npm run build
cargo run --release --manifest-path crates/depotpro-server/Cargo.toml
```
Par défaut, `depotpro-server` :
- Écoute sur `127.0.0.1:3000` (configurable via `DEPOTPRO_HOST` et `DEPOTPRO_PORT`).
- Utilise `./data/depotpro_v3.db` (`DEPOTPRO_DB_PATH`) et `./data/Sauvegardes` (`DEPOTPRO_BACKUP_DIR`).
- Sert le dossier `dist/` (`DEPOTPRO_DIST_DIR`) avec fallback SPA vers `index.html`, ainsi que l'API REST `/api/*`.
