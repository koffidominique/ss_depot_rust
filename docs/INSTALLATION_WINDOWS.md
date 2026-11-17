# Installation Windows (Desktop Tauri 2) — DEPOTPRO PREMIUM V3

> Note d'état : le projet inclut la configuration complète Tauri 2 (`src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.ico,icon.icns}`, `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`) prête à être compilée sur un poste Windows équipé de Rust et des outils MSVC.

## Prérequis de compilation sous Windows

1. **Microsoft C++ Build Tools** (Visual Studio Build Tools avec charge de travail *Développement Desktop en C++* et Windows 10/11 SDK).
2. **Rustup & Toolchain MSVC** (`stable-x86_64-pc-windows-msvc`).
3. **Node.js `>= 22.0`** et `npm`.
4. **Microsoft Edge WebView2 Runtime** (généralement préinstallé sur Windows 10/11 ; `tauri.conf.json` configure `"webviewInstallMode": { "type": "embedBootstrapper" }`).

## Compilation de l'installateur Windows

Installer les dépendances Node puis lancer le build Tauri 2 :
```powershell
npm install
npx tauri build
```
Les cibles configurées dans `src-tauri/tauri.conf.json` pour Windows sont :
- **`msi`** (installateur Windows Installer standard)
- **`nsis`** (installateur `.exe` avec raccourci bureau/menu Démarrer et désinstalleur)

Les artefacts générés se trouvent dans `src-tauri/target/release/bundle/msi/` et `src-tauri/target/release/bundle/nsis/`.

## Stockage des données & instance unique

- Les données ne sont **jamais** stockées dans `Program Files` : l'application utilise `app.path().app_data_dir()` (typiquement `%APPDATA%\com.depotpro.erp\` sous Windows) pour `depotpro_v3.db` et le sous-dossier `backups\`.
- **Verrou d'instance unique** : au démarrage, `src-tauri/src/lib.rs` crée `depotpro.lock` via `OpenOptions::create_new(true)` afin d'interdire l'accès simultané de deux processus à la même base SQLite. Le verrou est supprimé à la fermeture (`RunEvent::Exit`).
- Fonctionnement 100 % local et hors ligne, avec CSP stricte (`default-src 'self' ... connect-src 'self' ipc: http://ipc.localhost`).

## Impression et export PDF sous Windows

Les documents (`DocumentPrintModal`) utilisent le dialogue d'impression natif WebView2 (`window.print()`), permettant d'imprimer directement sur l'imprimante du dépôt ou de sélectionner *Microsoft Print to PDF*.
