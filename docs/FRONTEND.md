# Architecture Frontend — DEPOTPRO PREMIUM V3

## Pile technologique

- **Framework** : React 19 + TypeScript strict (`tsc --noEmit`).
- **Build & Dev** : Vite 8 + `@tailwindcss/vite` (Tailwind CSS v4, classes `dark` pilotées par `useUiStore`).
- **Routage** : `react-router-dom` v7 (`BrowserRouter`, garde d'authentification dans `AppLayout`).
- **Données & Requêtes** : `@tanstack/react-query` v5 (`staleTime: 10_000`, `retry: 1`) + `@tanstack/react-table` v8 (`DataTable` triable/filtrable).
- **UI & Formulaires** : Primitives Radix UI (`@radix-ui/react-dialog`, `tabs`, `switch`, `tooltip`), `lucide-react`, `react-hook-form` + `zod`, graphiques `recharts`, transitions `motion`.

## Couche d'abstraction API (`src/services/api/`)

L'interface `ApiClient` (`src/services/api/ApiClient.ts`) découple l'interface React du transport sous-jacent via `createApiClient.ts` :

- **`HttpApiClient`** : utilisé en mode Web (API REST `/api/*` avec jeton Bearer dans `sessionStorage` et gestion des erreurs structurées `ApiError`).
- **`TauriApiClient`** : sélectionné automatiquement lorsque `window.__TAURI_INTERNALS__` est présent. Transmet le jeton `depotpro_tauri_token` (`sessionStorage`) aux commandes IPC Tauri (`auth_*`, `list_*`, `create_*`, `get_*`, `open_cash_session`, `close_cash_session`, `create_backup`, etc.).

## Écrans disponibles (17 pages dans `src/pages/`)

1. **`LoginPage.tsx`** (`/login`) : configuration initiale du PIN propriétaire (6 chiffres) ou déverrouillage de session avec affichage de la temporisation en cas de verrouillage après échecs.
2. **`DashboardPage.tsx`** (`/`) : indicateurs clés (CA marchandises, consignes facturées, encaissements, créances, dettes fournisseurs, caisse physique théorique vs encaissements digitaux, alertes stock, graphique CA 30 jours, journal d'audit récent).
3. **`SalesPage.tsx`** (`/sales/new`) : caisse POS avec recherche produits, choix conditionnement, calcul automatique de la consigne liée, sélection client/politique de crédit, paiements mixtes (espèces + moyens digitaux), échéance et aperçu imprimable immédiat.
4. **`SalesHistoryPage.tsx`** (`/sales`) : historique paginé des ventes, détail complet d'une pièce, annulation totale (contre-écriture non destructive) et retour partiel avec génération d'avoir (`AVO-*`).
5. **`ClientsPage.tsx`** (`/clients`) : fiches clients, solde dû, solde d'emballages détenus, activation/plafond/blocage du crédit.
6. **`DebtsPage.tsx`** (`/debts`) : suivi des créances clients (`open`, `partial`, `paid`), encaissement simple ou mixte avec clé d'idempotence et impression de l'**État des créances clients**.
7. **`ProductsPage.tsx`** (`/products`) : catalogue multi-conditionnements, catégories, tarifs, CUMP, export/import CSV.
8. **`StockPage.tsx`** (`/stock`) : niveaux consolidés en unité de base, valorisation CUMP (ou mention `Coût non renseigné` sans coût connu), journal immuable des mouvements (`purchase_in`, `sale_out`, `sale_cancel_in`, `return_in`, `inventory_adjust`, `manual_adjust`) et impression du **Rapport de stock & valorisation**.
9. **`InventoryPage.tsx`** (`/inventories`) : création et validation d'inventaires physiques (`inventory_adjust`).
10. **`ConsignmentsPage.tsx`** (`/consignments`) : types d'emballages consignés, stock dépôt vs parc chez clients, retours bons ou endommagés (`REÇU RETOUR EMBALLAGES`), ajustement de stock vide.
11. **`SuppliersPage.tsx`** (`/suppliers`) : répertoire fournisseurs et règlement des dettes fournisseurs.
12. **`PurchasesPage.tsx`** (`/purchases`) : bons de commande (`CMD-*`) et réceptions partielles ou totales (`REC-*`) avec recalcul du CUMP.
13. **`CashPage.tsx`** (`/cash`) : ouverture/comptage/clôture de caisse physique (`CAI-*`), séparation stricte espèces vs flux digitaux, impression du **Rapport de caisse** sur session ouverte ou clôturée.
14. **`ExpensesPage.tsx`** (`/expenses`) : saisie des dépenses par mode de règlement (impact caisse physique uniquement si `cash`).
15. **`ReportsPage.tsx`** (`/reports`) : synthèses commerciales, rentabilité sur coût connu, ventilation par mode de paiement, valorisation stock.
16. **`SettingsPage.tsx`** (`/settings`) : identité commerciale du dépôt, préfixes documentaires, autorisation ou blocage stock négatif, gestion des moyens de paiement, thème Clair/Sombre.
17. **`BackupsPage.tsx`** (`/backups`) : création manuelle, vérification d'intégrité (`integrity_check`, `foreign_key_check`) et restauration sécurisée.

## Documents imprimables & Export PDF (`DocumentPrintModal.tsx`)

Le composant `DocumentPrintModal` s'appuie sur la feuille `@media print` (`.print-document-root` / `.no-print`) de `src/index.css` pour imprimer ou enregistrer en PDF via le navigateur / WebView système les 9 documents métier :
- `FACTURE`, `REÇU DE VENTE`, `AVOIR CLIENT`
- `BON DE COMMANDE`, `BON DE RÉCEPTION`
- `REÇU RETOUR EMBALLAGES`, `RAPPORT DE CAISSE`
- `ÉTAT DES CRÉANCES CLIENTS`, `RAPPORT DE STOCK & VALORISATION`
