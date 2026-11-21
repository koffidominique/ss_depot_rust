# LOT 01 — Architecture Rust unique (rapport d'avancement)

> Livrable **LOT 1** de `syst_emballages.md`. Ce rapport décrit l'état **réel** et **exécuté**.
> Le lot est scindé en deux sous-étapes pour préserver l'intégrité :
> **1a (fait, validé)** — Axum devient le **seul serveur métier lancé** ; **1b (fait, validé)** —
> suppression du code Node mort + port des scripts.

## Sous-étape 1a — Axum = unique serveur lancé ✅ (validée)

### Fichiers modifiés
| Fichier | Modification | Justification |
| ------- | ------------ | ------------- |
| `vite.config.ts` | Ajout `server.proxy['/api'] → http://127.0.0.1:3000` | Vite ne sert que la SPA ; `/api` part vers Axum |
| `scripts/dev.mjs` | **Nouveau** orchestrateur : lance `cargo run -p depotpro-server` + `vite` | Remplace l'hôte Node/Express `server.ts` ; Node = simple superviseur (autorisé) |
| `package.json` | `dev` → `node scripts/dev.mjs` ; `start` → `cargo run -p depotpro-server` ; `test` → `cargo test --workspace` | Démarrage web sur Axum ; tests sur le cœur Rust |
| `playwright.config.ts` | `webServer.command` → `npm run build && cargo run -p depotpro-server` ; timeout 240 s ; retrait `NODE_ENV=production` | E2E sur Axum (sert dist + /api) |

Aucune suppression en 1a : le serveur Node existe encore mais **n'est plus lancé**.

### Tests exécutés (résultats réels)
| Vérification | Commande | Résultat |
| ------------ | -------- | -------- |
| Compilation Axum | `cargo build -p depotpro-server` | ✅ |
| Démarrage Axum | binaire sur port 3999 | ✅ `/api/health` 200 `{"engine":"depotpro-axum"}`, `/api/auth/status` 200, `/api/dashboard` 401 |
| Build SPA | `npm run build` | ✅ built in ~444 ms |
| Orchestrateur dev | `node scripts/dev.mjs` (PORT=3999) | ✅ Axum :3999 = 200, Vite :5173 = 200, **proxy Vite→Axum `/api/health` = 200** |
| TypeScript | `npm run typecheck` | ✅ exit 0 |
| ESLint | `npm run lint` | ✅ exit 0 |
| Tests Rust | `npm test` (`cargo test --workspace`) | ✅ 36 passed / 0 failed |

### Ce qui est garanti par 1a
- **Aucun serveur Node métier lancé** : `dev`, `start`, et `test:e2e` passent tous par Axum.
- `depotpro-core` reste l'autorité métier ; Axum et Tauri l'utilisent (déjà le cas).
- Dev web : Vite (:5173) proxy `/api` → Axum (:3000).
- Prod web : Axum sert `./dist` (fallback SPA) + `/api`.

## Sous-étape 1b — Suppression du code Node mort ✅ (validée, atomique)

### Pourquoi atomique
Les éléments sont couplés : retirer `express` casse le typecheck de `server/**` ; supprimer
`server/` casse `scripts/seed_demo.ts`, `scripts/benchmark_perf.ts` et `tests/*.test.mjs`.
→ ils sont partis **dans le même changeset**, avec validation complète (build + typecheck + lint + tests).

### Supprimé
- `server/app.ts`, `server/db.ts`, `server/domain.ts`, `server/seedDemo.ts`, `server/services/*.ts` (11 fichiers)
- `server.ts` (racine, ancien hôte Express+Vite)
- `tests/*.test.mjs` (10 fichiers) — couverture déjà portée par `crates/depotpro-core/tests/*`
- `scripts/seed_demo.ts`, `scripts/benchmark_perf.ts` (portés en Rust, voir ci-dessous)
- Dépendances `express`, `@types/express`, `bcryptjs`, `@types/bcryptjs`, `tsx` (package.json)

### Porté / réécrit en Rust
- `scripts/seed_demo.ts` + `server/seedDemo.ts` (225 l.) → `crates/depotpro-core/examples/seed_demo.rs`
  (`npm run seed:demo` = `cargo run -p depotpro-core --example seed_demo`). Vérifié : sort
  `{"seeded":true,"suppliersAdded":2,"productsAdded":5,"returnablesAdded":3,"clientsAdded":3}`.
- `scripts/benchmark_perf.ts` → `crates/depotpro-core/examples/benchmark_perf.rs`
  (`npm run benchmark` = `cargo run -p depotpro-core --example benchmark_perf`). 3 benchs
  (recherche produit, détail vente, vente atomique) avec seuils p95.

### CI (`.github/workflows/ci.yml`)
- Job `node-tests` supprimé (redondant avec jobs Rust core/server ; `npm test` = `cargo test --workspace`).
- Job `cross-engine-parity` supprimé (plus de moteur Node → plus de parité à tester).
- Job `sqlite-migration` : `npm run benchmark` → `cargo run -p depotpro-core --example benchmark_perf`
  (ajout toolchain Rust). Vérif migration Python conservée.
- Jobs `playwright-e2e` : ajout toolchain Rust (Axum requis pour servir l'app).
- Renumérotation 1→11.

### `eslint.config.mjs`
Retrait de `server/**` et `server.ts` de `files` (ne plus lintés).

### Validation 1b (exécutée, résultats réels)
| Vérification | Commande | Résultat |
| ------------ | -------- | -------- |
| Formatage | `cargo fmt --all -- --check` | ✅ exit 0 |
| Clippy | `cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings` | ✅ 0 erreur |
| Tests Rust | `cargo test --workspace` | ✅ tous verts (7+2+2+4+1+1+4+3+2+4+1+3+2+4… passed, 0 failed) |
| TypeScript | `npm run typecheck` | ✅ exit 0 |
| ESLint | `npm run lint` | ✅ exit 0 |
| Build SPA | `npm run build` | ✅ built in ~446 ms |
| Seed Rust | `cargo run -p depotpro-core --example seed_demo` | ✅ JSON `seeded:true` |
| `grep express package.json` | — | ✅ vide |

### Réserve
`npm run test:e2e` complet (Playwright) et l'exécution CI ne peuvent être prouvés dans cet
environnement (pas de runner CI). La suite e2e reste inchangée et Axum est déjà validé comme
serveur (1a). Le changeset 1b est atomique et validé localement ; il n'est **pas commité** ici.