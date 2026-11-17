# Architecture Frontend — DEPOTPRO PREMIUM V3

## Pile technologique

- **Framework** : React 19 + TypeScript strict (`tsc --noEmit`).
- **Build & Dev** : Vite 8 + `@tailwindcss/vite` (Tailwind CSS v4, classes `dark` pilotées par `useUiStore`).
- **Routage** : `react-router-dom` v7 (`BrowserRouter`, routes chargées paresseusement via `React.lazy` / `Suspense`, garde d'authentification dans `AppLayout`).
- **Données & Requêtes** : `@tanstack/react-query` v5 (`staleTime: 10_000`, `retry: 1`) + `@tanstack/react-table` v8 (`DataTable` triable/filtrable).
- **UI & Formulaires** : Primitives Radix UI (`@radix-ui/react-dialog`, `tabs`, `switch`, `tooltip`), `lucide-react`, `react-hook-form` + `zod`, graphiques `recharts`, transitions `motion`, polices CSS offline sans dépendance CDN externe.

## Couche d'abstraction API (`src/services/api/`)

L'interface `ApiClient` (`src/services/api/ApiClient.ts`) découple l'interface React du transport sous-jacent via `createApiClient.ts` :

- **`HttpApiClient`** : utilisé en mode Web (API REST `/api/*` avec jeton Bearer dans `sessionStorage` et gestion des erreurs structurées `ApiError`).
- **`TauriApiClient`** : sélectionné automatiquement lorsque `window.__TAURI_INTERNALS__` est présent. Transmet le jeton `depotpro_tauri_token` (`sessionStorage`) aux commandes IPC Tauri (`auth_*`, `list_*`, `create_*`, `get_*`, `open_cash_session`, `close_cash_session`, `create_backup`, etc.).

## Navigation globale & recherche rapide

- **`Header.tsx` & `GlobalSearchModal.tsx`** : barre supérieure avec état de caisse temps réel, badge proactif d'alertes échéances dépassées (`overdueReceivablesCount + overdueSupplierDebtsCount`), accès conseils métier, bascule Clair/Sombre et recherche globale instantanée (`Ctrl+K` / `Cmd+K`) sur les 16 écrans, produits, clients, fournisseurs et ventes récentes.

## Écrans disponibles (17 pages dans `src/pages/`)

1. **`LoginPage.tsx`** (`/login`) : configuration initiale du PIN propriétaire (6 chiffres) ou déverrouillage de session avec affichage de la temporisation en cas de verrouillage après échecs.
2. **`DashboardPage.tsx`** (`/`) : indicateurs clés (CA marchandises, consignes facturées, encaissements, créances, dettes fournisseurs, caisse physique théorique vs encaissements digitaux, bandeaux d'alertes proactives créances clients / dettes fournisseurs échues, alertes stock, graphique CA 30 jours, journal d'audit récent).
3. **`SalesPage.tsx`** (`/sales/new`) : caisse POS avec recherche produits, ajout instantané par lecteur code-barres (`Entrée`), miniatures produit (`image_path`), choix conditionnement, calcul automatique de la consigne liée, sélection client (avec bandeau crédit/solde/vides) ou création rapide (`+ Nouveau client`), mise en attente / reprise de paniers (`depotpro_held_carts`), raccourcis clavier (`F2` recherche, `F9` validation, `Échap` fermeture modales), paiements mixtes (espèces + moyens digitaux), échéance et aperçu imprimable immédiat.
4. **`SalesHistoryPage.tsx`** (`/sales`) : historique paginé des ventes avec filtres statut, texte et plage de dates (`Du` / `Au`), export CSV complet (paginé sur toutes les ventes filtrées), détail complet d'une pièce, annulation totale (contre-écriture non destructive) et retour partiel avec génération d'avoir (`AVO-*`), avec choix explicite du moyen de remboursement (espèces ou canal digital actif).
5. **`ClientsPage.tsx`** (`/clients`) : fiches clients (création/édition validées par `react-hook-form` + `zod`), solde dû, solde d'emballages détenus, activation/plafond/blocage du crédit et modale **Fiche / Historique** (échéances, ventes récentes, consignes détenues).
6. **`DebtsPage.tsx`** (`/debts`) : suivi des créances clients (`open`, `partial`, `paid`) avec montant payé, calcul des jours de retard (`+X j retard`), export CSV, consultation détaillée de l'historique des versements (`getSaleDetail`), encaissement simple/mixte et impression de l'**État des créances clients**.
7. **`ProductsPage.tsx`** (`/products`) : catalogue multi-conditionnements (création produit et catégorie validées par `react-hook-form` + `zod`), catégories, tarifs, CUMP, photo produit locale redimensionnée (`compressLocalImage` -> `image_path`), export/import CSV.
8. **`StockPage.tsx`** (`/stock`) : niveaux consolidés en unité de base, valorisation CUMP (ou mention `Coût non renseigné` sans coût connu), journal immuable des mouvements (jusqu'à 500 mouvements, `purchase_in`, `sale_out`, `sale_cancel_in`, `return_in`, `inventory_adjust`, `manual_adjust`), export CSV des soldes ou mouvements et impression du **Rapport de stock & valorisation**.
9. **`InventoryPage.tsx`** (`/inventories`) : création, comptage physique avec filtre nom/référence, filtre « Écarts uniquement » et compteur temps réel, validation (`inventory_adjust`) et export PDF / impression de la fiche d'inventaire.
10. **`ConsignmentsPage.tsx`** (`/consignments`) : types d'emballages consignés, stock dépôt vs parc chez clients, retours bons ou endommagés (`REÇU RETOUR EMBALLAGES`), export CSV (soldes clients & journal des mouvements), impression directe de l'**État des consignations** et ajustement de stock vide.
11. **`SuppliersPage.tsx`** (`/suppliers`) : répertoire fournisseurs (création/édition validées par `react-hook-form` + `zod`), règlement des dettes fournisseurs et modale **Historique achats & dettes**.
12. **`PurchasesPage.tsx`** (`/purchases`) : bons de commande (`CMD-*`), export CSV des approvisionnements, annulation contrôlée d'une commande non réceptionnée avec motif obligatoire validé par `react-hook-form` + `zod` (`POST /api/purchases/:id/cancel`), réceptions partielles ou totales (`REC-*`) avec recalcul du CUMP et modale **Écarts & Dettes** (quantités commandées vs reçues, réceptions et dettes fournisseurs/échéances liées).
13. **`CashPage.tsx`** (`/cash`) : ouverture/comptage/clôture de caisse physique (`CAI-*`) validés par `react-hook-form` + `zod` (commentaire obligatoire en cas d'écart != 0), export CSV des mouvements de session et de l'historique des sessions, séparation stricte espèces vs flux digitaux, impression du **Rapport de caisse** sur session ouverte ou clôturée.
14. **`ExpensesPage.tsx`** (`/expenses`) : saisie des dépenses validée par `react-hook-form` + `zod`, pièce justificative optionnelle (`receipt_path` compressée localement + visionneuse), export CSV, impact caisse physique uniquement si `cash` et filtres par catégorie et période.
15. **`ReportsPage.tsx`** (`/reports`) : rapports à 6 onglets (`Commercial & Finances`, `Stock & Valorisation`, `Caisse & Trésorerie`, `Créances clients`, `Fournisseurs & Dettes`, `Consignations`) avec filtrage par plage, export CSV par onglet et export PDF natif via `DocumentPrintModal`.
16. **`SettingsPage.tsx`** (`/settings`) : sections **Général & société** (logo personnalisé `logo_path`, nom, raison sociale, e-mail, téléphone, adresse, ville, pays), **Documents & numérotation** (`VTE`, `FAC`, `AVO`, `CMD`, `REC`, `ACH`), **Commercial & stock** (stock négatif), **Affichage** (Clair/Sombre), **Moyens de paiement** et **Sécurité** (changement PIN 6 chiffres).
17. **`BackupsPage.tsx`** (`/backups`) : création manuelle, vérification d'intégrité (`integrity_check`, `foreign_key_check`) et restauration sécurisée.

## Documents imprimables & Export PDF natif (`DocumentPrintModal.tsx`)

Le composant `DocumentPrintModal` permet à la fois l'impression navigateur (`@media print` dans `src/index.css`) et le téléchargement d'un fichier **PDF 1.4 natif A4** généré sans dépendance externe (`POST /api/documents/pdf` côté Web via `server/services/pdf.ts`, ou commande Tauri `generate_document_pdf` via `crates/depotpro-core/src/application/pdf.rs`) pour les 9 documents métier :
- `FACTURE`, `REÇU DE VENTE`, `AVOIR CLIENT`
- `BON DE COMMANDE`, `BON DE RÉCEPTION`
- `REÇU RETOUR EMBALLAGES`, `RAPPORT DE CAISSE`
- `ÉTAT DES CRÉANCES CLIENTS`, `RAPPORT DE STOCK & VALORISATION`
