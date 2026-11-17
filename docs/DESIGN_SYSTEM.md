# DESIGN SYSTEM DEPOTPRO V3

- **Thèmes** : Light Mode (`#F5F7FB` canvas / `#FFFFFF` surfaces / `#182230` texte) et Dark Mode (`#0B1220` canvas / `#111A2E` surfaces / `#F8FAFC` texte).
- **Typographie** : `Plus Jakarta Sans` (titres), `DM Sans` (corps), `JetBrains Mono` + `tabular-nums` (`font-mono-num`) sur tous les montants FCFA, quantités et horodatages.
- **Discipline composants** :
  - Statuts exprimés par icône + texte coloré sémantique (aucune pilule décorative).
  - Tableaux `@tanstack/react-table` avec tri et pagination serveur.
  - Modales & tiroirs accessibles via `@radix-ui/react-dialog`, onglets via `@radix-ui/react-tabs`, interrupteurs via `@radix-ui/react-switch`.
  - Impressions propres via `@media print` (`.no-print`).
