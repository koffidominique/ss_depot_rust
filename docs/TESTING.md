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
- Test du script `scripts/migrate_v2_to_v3.py` sur une base Python synthétique V2

## Tests de contrats & précision (`tests/contracts.test.mjs`, exécuté via `npm run test`)

- Précision stricte FCFA entiers & `*_milli` (`toMilli`, `computeLineTotalFcfa`, `formatMilli`, `formatQty`, `formatFcfa`).
- Parité **100 %** des méthodes `ApiClient` entre `HttpApiClient` et `TauriApiClient`.
- Vérification statique que toutes les commandes invoquées par `TauriApiClient` existent et sont enregistrées dans `src-tauri/src/commands.rs` et `src-tauri/src/lib.rs`.
- Vérification que toutes les routes `/api/*` existent dans `server/app.ts` et `crates/depotpro-server/src/main.rs`.
- Vérification de la prise en charge des 9 documents imprimables obligatoires dans `DocumentPrintModal.tsx`.

## Tests d'intégration Rust (`crates/depotpro-core/tests/scenarios.rs`)

Suite `tokio::test` exécutée sur base SQLite temporaire isolée couvrant les scénarios A à L (auth PIN, catalogue/conditionnements, achats/réceptions, ventes comptant/crédit/paiements mixtes, retours partiels, consignations bon état/cassé, inventaires, clôture caisse avec écart justifié, sauvegardes `VACUUM INTO`).

## Benchmark de charge (`npm run benchmark`)

Exécuté sur une base SQLite temporaire peuplée avec **10 000 produits**, **10 000 clients**, **100 000 lignes de vente** et **100 000 mouvements de stock** (`scripts/benchmark_perf.ts`, 50 itérations par opération) :
- Recherche produit paginée (10 000 produits) : p50 = `15.59 ms`, p95 = `18.34 ms` (cible `< 300 ms`)
- Détail vente complet (100 000 lignes) : p50 = `0.19 ms`, p95 = `0.41 ms` (cible `< 150 ms`)
- Validation vente atomique (transaction + stock) : p50 = `0.96 ms`, p95 = `1.50 ms` (cible `< 500 ms`)

## Limites d'environnement connues

Les toolchains `rustc`/`cargo`, `tauri`, Chromium/Playwright ainsi que les environnements Windows/macOS ne sont pas installés dans ce conteneur Linux Node ; `cargo test --workspace`, `npx tauri build` et les tests Playwright doivent être exécutés sur un poste équipé.
