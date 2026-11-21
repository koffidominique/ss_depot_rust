# STRATÉGIE & RAPPORT DE TESTS

## Tests automatisés exécutables dans l'environnement Node (`npm run test`)

Exécutés sur une base SQLite temporaire isolée (`tests/api.test.mjs`) via `node:test` :
- Authentification propriétaire (configuration PIN 6 chiffres, refus PIN invalide, blocage 5 tentatives)
- **Scénario A** : Produit boisson, conditionnements (bouteille=1, casier=24, pack=6) et conversions
- **Scénario B** : Bon de commande sans effet sur le stock -> Réception 10 casiers -> +240 bouteilles + CUMP + dette fournisseur
- **Scénario C** : Vente 1 casier + 3 bouteilles -> -27 bouteilles + consigne séparée du CA marchandises
- **Scénarios D & E** : Vente à crédit 100 000 FCFA -> créance 100 000 -> paiement partiel 20 000 -> solde 80 000
- **Scénario F** : Paiement mixte 50 000 FCFA (10 000 Espèces + 15 000 Wave + 25 000 Orange Money) et séparation stricte espèces vs digital en caisse
- **Scénario G** : Annulation de vente par contre-écriture (restauration stock, annulation créance, remboursement caisse, journal d'audit)
- **Scénario H** : Inventaire physique avec écart justifié et mouvement `inventory_adjust`
- **Scénario I** : Sauvegarde `VACUUM INTO`, vérification `PRAGMA integrity_check` et restauration contrôlée
- **Scénario J** : Retour partiel avec avoir (`AVO-*`), remise en stock (`return_in`) et remboursement caisse
- **Scénario K** : Consignations (profil de consigne, vente avec consigne séparée, retour client `good` et `damaged` libérant le compte emballage)
- **Scénario L** : Clôture de caisse avec rejet d'écart non motivé puis validation avec commentaire justificatif
- **Scénario M** : Endpoint `/api/reports?from=&to=` avec agrégation `dailySales` et filtrage par plage de `expensesTotal` et `paymentBreakdown`
- **Scénario N** : Génération PDF 1.4 native (`POST /api/documents/pdf`) pour les documents métier avec pagination multi-pages et encodage WinAnsi des accents français
- **Scénario O** : Téléchargement authentifié de sauvegarde (`GET /api/backups/:name/download`), création de catégorie et mouvement d'ajustement d'emballages
- **Scénario P** : Validation et persistance de photo produit locale (`image_path` PNG/JPEG/WebP data URI et suppression à `null`)
- **Scénario Q** : En-têtes de sécurité HTTP (`X-Content-Type-Options`, `X-Frame-Options`, `Cache-Control: no-store`), rejet CSRF cross-origin (`403 FORBIDDEN_ORIGIN`), persistance étendue des paramètres et rétention automatique à 30 sauvegardes
- **Scénario R** : Ajustement manuel du stock audité (`POST /api/stock/adjust`) : motif obligatoire, blocage stock négatif, mouvement `manual_adjust` (`ADJ-*`), rejeu idempotent (`request_key`) et refus sur produit archivé
- **Scénario S** : Édition complète Clients (`PUT /api/clients/:id`) & Fournisseurs (`PUT /api/suppliers/:id`), mise à jour complète des conditionnements existants (anti-doublon `DUPLICATE_OPERATION`) et génération PDF dédiée (`BILAN COMMERCIAL & FINANCES`, `ÉTAT DES DETTES FOURNISSEURS`, `ÉTAT DES CONSIGNATIONS`)
- **Scénario T** : Logo personnalisé d'entreprise (`settings.logo_path` PNG/JPEG/WebP validé et réinitialisable à `null`) et remboursement multi-canal (`refund_method_code: 'wave'`) lors d'une annulation de vente
- **Scénario U** : Annulation contrôlée de bon de commande non réceptionné (`POST /api/purchases/:id/cancel` : motif obligatoire, refus double annulation ou après réception partielle) et alertes d'échéances dépassées sur `/api/dashboard` (`overdueReceivablesCount`, `overdueReceivablesTotal`, `overdueSupplierDebtsCount`, `overdueSupplierDebtsTotal`)
- **Scénario V** : Justificatif de dépense (`expenses.receipt_path`) : validation data URI PNG/JPEG/WebP, rejet des schémas invalides, persistance et exposition dans `GET /api/expenses`
- **Scénario W** : Filtrage par plage de dates (`from` / `to`) sur `GET /api/sales` et `sales::list_sales`
- **Scénario X** : Persistance de session multi-canal (`Authorization: Bearer`, `X-DepotPro-Token` et cookie `HttpOnly` `depotpro_session`), détection `authenticated` sur `/api/auth/status` et isolation du rate-limiter par route
- Test du script `scripts/migrate_v2_to_v3.py` sur une base Python synthétique V2

## Tests de contrats & précision (`tests/contracts.test.mjs`, exécuté via `npm run test`)

- Précision stricte FCFA entiers & `*_milli` (`toMilli`, `computeLineTotalFcfa`, `formatMilli`, `formatQty`, `formatFcfa`).
- Parité **100 %** des méthodes `ApiClient` entre `HttpApiClient` et `TauriApiClient`.
- Vérification statique que toutes les commandes invoquées par `TauriApiClient` existent et sont enregistrées dans `src-tauri/src/commands.rs` et `src-tauri/src/lib.rs`.
- Vérification que toutes les routes `/api/*` existent dans `server/app.ts` et `crates/depotpro-server/src/main.rs` (y compris `/api/documents/pdf` et `/api/backups/:name/download`) et parité `image_path` + présence `src-tauri/build.rs` & `src-tauri/icons/*`.
- Vérification de la prise en charge des 9 documents imprimables obligatoires dans `DocumentPrintModal.tsx`, `server/services/pdf.ts` et `crates/depotpro-core/src/application/pdf.rs`.

## Tests composants, formulaires & interactions React (`tests/ui.test.mjs`, exécuté via `npm run test`)

Exécutés dans `happy-dom` avec `@testing-library/react` :
- `MoneyInput` : filtrage strict des entrées vers des entiers FCFA sans décimales.
- `QuantityInput` : saisie fractionnaire à 3 décimales max et blocage des fractions si `allowFraction=false`.
- `StatusBadge` : libellés français des statuts (`Validé`, `Retour partiel`, `Annulé`, `Ouverte`).
- `DataTable` : rendu des colonnes, gestion du clic ligne et état vide.
- `FormTipsButton` & `BusinessTipsModal` : ouverture contextuelle des règles métier et bascule Clair/Sombre.
- `LoginPage` : création et confirmation du PIN propriétaire à 6 chiffres (`setupPin`).
- `DocumentPrintModal` : aperçu document et déclenchement de l'export PDF natif (`generateDocumentPdf`).
- `DebtsPage` : affichage `Payé`, calcul des jours de retard (`+X j retard`) et ouverture de l'historique des paiements.
- `SettingsPage` : affichage et persistance de l'ensemble des préfixes (`order_prefix`, `receipt_prefix`, `credit_note_prefix`, etc.) et de la raison sociale.
- `SalesPage` : ajout instantané d'un conditionnement au panier lors d'un scan code-barres + touche `Entrée`.
- `PurchasesPage` : modale **Écarts & Dettes** avec lignes commandées vs reçues, réceptions `REC-*` et dettes/échéances liées.
- `StockPage` : ajustement manuel audité du stock (`POST /api/stock/adjust`, commande `adjust_stock`) avec prévisualisation avant → après et motif obligatoire.
- `ClientsPage` & `SuppliersPage` : édition complète des fiches (coordonnées, ville, e-mail, interlocuteur, délai règlement fournisseur, statut actif/archivé).
- `ProductsPage` : chargement fidèle des valeurs réelles lors de la modification d’un conditionnement existant (`id`, prix d'achat/gros/demi-gros/détail, code-barres, fractions, statut, consigne).
- `ReportsPage` : export PDF natif dédié pour chacun des 6 onglets (Commercial, Stock, Caisse, Créances, Fournisseurs, Consignations).
- `DocumentPrintModal` : affichage du logo personnalisé `company.logo_path` lorsque configuré dans les paramètres.
- `SalesHistoryPage` : sélection explicite du moyen de remboursement (`cash`, `wave`, etc.) lors de l'annulation ou du retour partiel.
- `Header` & `GlobalSearchModal` : ouverture de la recherche globale (`Ctrl+K`) et filtrage combiné des écrans et entités.
- `InventoryPage` : filtrage des articles pendant le comptage avec compteur d'écarts temps réel sans perte des quantités saisies sur les lignes masquées.
- `PurchasesPage` (annulation) : annulation d'un bon de commande non réceptionné avec motif obligatoire et appel à `cancelPurchaseOrder`.
- `SalesPage` (POS avancé) : mise en attente / reprise de ventes (`depotpro_held_carts`), création client rapide et validation clavier `F9`.
- `DashboardPage` & `Header` : affichage des bandeaux proactifs et du badge d'alerte pour les créances et dettes fournisseurs à échéance dépassée.
- `ExpensesPage` : validation formulaire `react-hook-form` + `zod`, pièce justificative (`receipt_path`) avec prévisualisation et visionneuse, et export CSV (`;` + BOM UTF-8).
- `SalesHistoryPage`, `DebtsPage` & `StockPage` : exports CSV (`exportSalesCsv`, `exportReceivablesCsv`, `exportStockBalancesCsv`, `exportStockMovementsCsv`).
- `ClientsPage` : validation formulaire `react-hook-form` + `zod` (blocage soumission si nom vide).
- `ProductsPage` : validation produit/catégorie `react-hook-form` + `zod` et réutilisation de `compressLocalImage`.
- `SalesHistoryPage` (dates) : filtrage par plage de dates (`from` / `to`) transmis à `listSales` et réinitialisation des filtres.
- `CashPage`, `PurchasesPage` & `ConsignmentsPage` : validation Zod/RHF de l'écart de clôture caisse et de l'annulation PO, plus exports CSV (`exportCashMovementsCsv`, `exportCashSessionsCsv`, `exportPurchasesCsv`, `exportConsignmentBalancesCsv`).
- `LoginPage` : saisie clavier rapide sans perte de chiffres, blocage des doubles déclenchements sur `Entrée`, bouton **Réessayer** sur erreur serveur et reprise automatique sur session cookie.

## Tests navigateur E2E (`tests/e2e/app.spec.ts` / `playwright.config.ts`, via `npm run test:e2e`)

Suite Playwright couvrant la configuration PIN initiale, la bascule thème Clair/Sombre, le parcours complet des 17 écrans, la création produit, les 6 onglets Rapports et le contrôle d'absence d'erreurs console/JS.

## Intégration continue (`.github/workflows/ci.yml`)

Pipeline GitHub Actions orchestrant :
- Web (`typecheck`, `lint` ESLint, `test` 59/59, `build`, `benchmark`, `migrate_v2_to_v3.py --strict`)
- Playwright E2E Chromium (`npm run test:e2e`)
- Rust (`cargo fmt --all -- --check`, `cargo clippy -- -D warnings`, `cargo test`)
- Tauri 2 (`windows-latest` & `macos-latest`)

## Tests d'intégration Rust (`crates/depotpro-core/tests/scenarios.rs`)

Suite `tokio::test` exécutée sur base SQLite temporaire isolée couvrant les scénarios A à L ainsi que les scénarios étendus (R, S, T, U, V, W : ajustement stock, édition clients/fournisseurs/conditionnements, PDF rapports dédiés, `image_path`, `logo_path`, `receipt_path`, remboursement Wave, annulation PO non réceptionné, alertes échéances dépassées, filtrage dates ventes, sauvegardes `VACUUM INTO`).

## Benchmark de charge (`npm run benchmark`)

Exécuté sur une base SQLite temporaire peuplée avec **10 000 produits**, **10 000 clients**, **100 000 lignes de vente** et **100 000 mouvements de stock** (50 itérations par opération) :
- Recherche produit paginée (10 000 produits) : p50 = `37.13 ms`, p95 = `38.80 ms` (cible `< 300 ms`)
- Détail vente complet (100 000 lignes) : p50 = `0.57 ms`, p95 = `1.03 ms` (cible `< 150 ms`)
- Validation vente atomique (transaction + stock) : p50 = `1.24 ms`, p95 = `2.60 ms` (cible `< 500 ms`)

Rejoué le 2026-11-19 sur macOS arm64 via l'exemple Rust `benchmark_perf` (workspace Rust-only).

## Limites d'environnement connues

Les toolchains `rustc`/`cargo`, `tauri`, Chromium/Playwright ainsi que les environnements Windows/macOS ne sont pas installés dans ce conteneur Linux Node ; `cargo test --workspace`, `npx tauri build` et les tests Playwright doivent être exécutés sur un poste équipé.
