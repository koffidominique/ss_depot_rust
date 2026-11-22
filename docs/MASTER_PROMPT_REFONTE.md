# MASTER PROMPT — REFONTE DEPOTPRO PREMIUM
## Gestion commerciale, reçus clients, commandes fournisseurs, réceptions et documents comptables

---

# 1. RÔLE ET OBJECTIF DE LA MISSION

Tu interviens en qualité de développeur logiciel senior Full-Stack, architecte Rust, React/TypeScript, SQLite et Axum, spécialisé dans les applications ERP, la gestion commerciale, la comptabilité opérationnelle, la gestion des stocks et les systèmes de traçabilité.

Tu dois travailler directement dans le dépôt :

**Repository :** https://github.com/koffidominique/ss_depot_rust.git

**Branche principale :** `main`

**Application :** DEPOTPRO — Gestion intelligente de sous-dépôts de boissons.

L'objectif est de réaliser une refonte approfondie du système de gestion des commandes, des reçus et des bons de commande, avec une véritable intégration dans l'architecture métier existante.

Il ne s'agit pas de créer de simples modèles PDF indépendants.

Il faut construire un véritable système documentaire et opérationnel connecté à la base SQLite, aux commandes, aux fournisseurs, aux clients, aux produits, aux stocks, aux emballages consignés, aux paiements et aux dettes.

La solution doit être adaptée aux réalités commerciales des sous-dépôts de boissons en Côte d'Ivoire.

**RÈGLE FONDAMENTALE : chaque document doit représenter fidèlement une opération réellement enregistrée dans DEPOTPRO. Aucun montant, paiement, retour d'emballage, produit ou mouvement de stock ne doit être inventé ou déduit d'une simple impression.**

---

# 2. AUDIT OBLIGATOIRE AVANT TOUTE MODIFICATION

Avant d'écrire du code, examiner intégralement le dépôt et identifier les fonctionnalités déjà présentes.

Architecture connue :

- Frontend : React 19, TypeScript, Vite, Tailwind CSS.
- Backend : Rust, Axum.
- Base de données : SQLite.
- Accès aux données : SQLx.
- Gestion documentaire : moteur PDF vectoriel Rust et rendu HTML React.
- Application desktop : Tauri.
- Gestion des accès : RBAC et permissions métier.

Examiner particulièrement :

### Documents clients

- `src/components/documents/PrintableDocumentSheet.tsx`
- `src/components/documents/DocumentPrintModal.tsx`
- `src/features/orders/utils/orderPrintDocument.ts`
- `src/features/orders/components/OrderStepConfirm.tsx`
- Les composants et hooks du module `src/features/orders/`.

### Documents fournisseurs

- `src/pages/PurchasesPage.tsx`
- `src/features/purchases/components/PurchasesTable.tsx`
- `src/features/purchases/components/PurchaseOrderModal.tsx`
- `src/features/purchases/components/PurchaseReceiveModal.tsx`
- `src/features/purchases/components/PurchaseDetailModal.tsx`
- Les hooks de `src/features/purchases/`.

### Backend Rust

- `crates/depotpro-core/src/application/orders/`
- `crates/depotpro-core/src/application/purchases/`
- `crates/depotpro-core/src/application/pdf/`
- `crates/depotpro-server/src/handlers/orders.rs`
- Les routeurs Axum associés.
- Les commandes Tauri associées.

### Base de données

Examiner les tables et migrations concernant :

- `orders`
- `order_lines`
- `order_packaging_allocations`
- `order_line_packaging_links`
- `sales`
- `sale_lines`
- `payments`
- `payment_parts`
- `payment_methods`
- `clients`
- `suppliers`
- `products`
- `product_variants`
- `purchase_orders`
- `purchase_order_lines`
- `purchase_receipts`
- `purchase_order_packaging_requirements`
- `supplier_packaging_exchange_lines`
- `app_settings`
- `users`

Vérifier également les migrations existantes, notamment les migrations 0021, 0022 et 0023.

### Précaution concernant les travaux déjà réalisés

La branche principale possède déjà un système d'émission de reçus de commande client, un instantané historique versionné, un moteur PDF A4 dédié et un circuit de réception fournisseur.

Une Pull Request de rapprochement graphique du reçu avec le modèle fourni a également été ouverte :

https://github.com/koffidominique/ss_depot_rust/pull/13

Inspecter son état avant toute intervention.

Ne pas recréer les fonctionnalités déjà disponibles. Réutiliser, corriger et compléter ce qui existe.

Ne supprimer aucune fonctionnalité opérationnelle sans justification technique démontrée.

---

# 3. DISTINCTION OBLIGATOIRE ENTRE LES DOCUMENTS

Le système doit gérer séparément quatre documents commerciaux :
1. **REÇU DE COMMANDE CLIENT**
2. **REÇU DE PAIEMENT CLIENT**
3. **BON DE COMMANDE FOURNISSEUR**
4. **BON DE RÉCEPTION FOURNISSEUR**

---

# 4–20. RÉSUMÉ DES PRIORITÉS

1. **PRIORITÉ 1 — Reçu de commande client** : fidélité au modèle PDF, connexion aux données réelles, suivi physique des casiers, émission automatique après validation, impression/PDF, historique des versions.
2. **PRIORITÉ 2 — Bon de commande fournisseur** : refonte du document, détail des produits/conditionnements, emballages réservés, montant commandé, impression et historique.
3. **PRIORITÉ 3 — Bon de réception fournisseur** : réception complète/partielle, gestion des écarts, emballages remis, mise à jour stock/dettes, PDF de réception.
4. **PRIORITÉ 4 — Reçu de paiement client** : ventilation des moyens de paiement, références de transaction, paiements partiels/mixtes, reçu individuel d'encaissement.
5. **PRIORITÉ 5 — Centre documentaire** : onglet « Reçus et Bons de commandes », recherche avancée, filtres comptables, historique, export et réimpression.
