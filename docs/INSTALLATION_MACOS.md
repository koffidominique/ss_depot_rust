# Installation macOS (Desktop Tauri 2) — DEPOTPRO PREMIUM V3

> Note d'état : le workspace Tauri 2 (`src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/icons/icon.icns`, `src-tauri/src/*`) configure les cibles `.app` et `.dmg` (`minimumSystemVersion: 12.0`). La compilation et la signature nécessitent un environnement macOS avec Xcode Command Line Tools et Rust.

## Prérequis de compilation sous macOS

1. **macOS 12.0 (Monterey) ou supérieur**.
2. **Xcode Command Line Tools** (`xcode-select --install`) ou Xcode complet.
3. **Toolchain Rust** (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`).
4. **Node.js `>= 22.0`** et `npm`.

## Compilation du bundle `.app` et de l'image `.dmg`

```bash
npm install
npx tauri build
```
Les cibles configurées dans `src-tauri/tauri.conf.json` génèrent :
- `src-tauri/target/release/bundle/macos/DEPOTPRO ERP.app`
- `src-tauri/target/release/bundle/dmg/DEPOTPRO ERP_3.0.0_*.dmg`

Pour un build Universal Binary (Apple Silicon + Intel) sur macOS :
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npx tauri build --target universal-apple-darwin
```

## Stockage des données & instance unique

- Les fichiers applicatifs (base `depotpro_v3.db`, sous-dossier `backups/` et verrou `depotpro.lock`) sont enregistrés dans `~/Library/Application Support/com.depotpro.erp/` via `app.path().app_data_dir()`, jamais dans le paquet `.app`.
- Le verrou d'instance unique (`depotpro.lock`) empêche l'ouverture parallèle de deux fenêtres sur la même base SQLite et est libéré proprement lors de `RunEvent::Exit`.

## Signature & Notarisation

Pour une distribution hors App Store sans avertissement Gatekeeper :
- Configurer un certificat *Developer ID Application* (`APPLE_SIGNING_IDENTITY`) ainsi que les variables de notarisation Apple (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) lors de `npx tauri build`.

## Impression & PDF sous macOS

Le bouton **Imprimer / Enregistrer en PDF** de `DocumentPrintModal` ouvre la boîte de dialogue d'impression WKWebView de macOS, qui intègre nativement *Enregistrer au format PDF*.
