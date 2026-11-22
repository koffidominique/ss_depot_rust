# Audit et avancement — reçu de commande client DEPOTPRO

## Architecture et données observées

- Frontend React/TypeScript/Vite : parcours sous `src/features/orders`, rendu imprimable dans `PrintableDocumentSheet.tsx` et `DocumentPrintModal.tsx`.
- Backend Rust (`depotpro-core`) et Axum/Tauri; SQLx/SQLite, contrôles de permission RBAC.
- Schéma local v22 initialement; migration additive v23 créée pour conserver l'émission des reçus.
- Le PDF est généré par le moteur vectoriel A4 multipage Rust; l'aperçu navigateur est HTML. Les deux rendus ont maintenant des présentations dédiées au reçu et prennent le document émis comme source de vérité.
- Tables métier réellement utilisées : `orders`, `order_lines`, `order_packaging_allocations`, `order_line_packaging_links`, `packaging_movements`, `clients`, `payments`, `payment_parts`, `payment_methods`, `app_settings`, `users`, `sales`.

| Section du reçu | Source | Limites métier identifiées |
|---|---|---|
| Dépôt/logo | `app_settings` | Nom légal, adresse, contacts, logo et devise existent. Activité, RCCM/NCC et téléphone WhatsApp distinct ne sont pas structurés. |
| Numéro / date / émetteur | `orders.order_number`, `created_at`, `created_by`, session utilisateur | Pas de numéro d'émission avant v23. Un numéro de reçu stable `REC-<numéro commande>` est maintenant émis avec l'instantané; date et identité de session figurent dans le snapshot. L'heure PDF est rendue selon les données d'émission. |
| Client | `clients.name`, `client_type`, `phone`, `address`, `city`, `contact_person` | Le snapshot d'émission fige les champs de fiche connus. Pas de catégorie fine de type maquis/cave/bar ni repère dédié. |
| Retrait/livraison | `orders.delivery_address`, `delivery_date`, `status` | Pas de mode, livreur, heure ou frais explicites. `order_type` est `vente`/`mixte`, pas le mode livraison. Interface : adresse/date de livraison prévue, sans confondre cela avec `delivered`. |
| Boissons | `order_lines` + relations `products`, `product_variants` | Totaux XOF enregistrés; les libellés produit/variante se modifient dans le catalogue. Le snapshot d'émission capture le détail rendu au moment où le reçu est émis. |
| Composition/casiers | `order_line_packaging_links`, allocations, `packaging_assets` | Liens par ligne conservés. Les PDF/aperçus distinguent prévu, remis, rendu et solde; la remise n'est affichée que pour état livré/facturé/soldé. Consigne unitaire/totale affichée à partir de `deposit_amount_xof`. Aucun retour n'est créé à l'impression. |
| Montants | Colonnes `orders.subtotal_xof`, `discount_xof`, `tax_xof`, `total_xof`, `deposit_due_xof`, `total_to_collect_xof`, `paid_xof` | Tous entiers FCFA. Reçu consomme ces chiffres plutôt que recalculer son total. Frais de livraison distincts absents du métier actuel. |
| Encaissements | `payments.order_id`, `payments.reference/note/created_at`, `payment_parts.method_code/amount`, `payment_methods.label` | Les paiements réellement associés sont maintenant inclus dans le snapshot, ventilés par moyen. `payments.reference` est une référence interne, pas la référence Mobile Money externe. `paid_xof` reste le montant total source. |
| Facture ultérieure | `sales.order_id`, `sales.reference` (migration 0021) | Facturation après livraison distincte du reçu de commande initial. |
| Historique | nouveau `customer_order_receipt_snapshots` (migration 0023) | Première émission version 1 immuable et idempotente. L'owner peut créer une version suivante avec motif obligatoire; les versions sont listables et réimprimables sans écraser l'original. Les commandes en brouillon/en attente de validation ou annulées ne peuvent pas émettre/corriger. |

## Modèle PDF fourni

Le modèle joint comporte deux pages A4 portrait; la première concentre identité, référence/date/caissier, client, retrait/livraison, boissons, emballages/retours, finance, règlements et signatures; la seconde contient le remerciement. La mise en page navigateur dédiée suit ces sections sur une page avec pagination naturelle et impression A4; elle n'impose pas une page vide aux petits reçus.

## Évolutions apportées au cours

1. **Aperçu et impression navigateur** : sections spécifiques à l'accusé, emballages hors tableau de boissons, totaux persistés, ventilation d'encaissements, mode prévu, coordonnées client, signatures et règles print A4.
2. **Migration additive v23** : table snapshot append-only avec version, numéro unique, JSON figé, date, utilisateur et rôle d'émission.
3. **Émission idempotente et versions** : commande HTTP `POST /api/orders/:id/receipt` et commandes Tauri dédiées. Le backend assemble commande, client, settings et paiements réels; première émission crée version 1. Les routes `GET/POST /api/orders/:id/receipts` listent les snapshots et permettent à l'owner d'émettre une version corrigée avec motif. Réimpression sélectionne un snapshot précis; aucune version antérieure n'est modifiée. Impression n'effectue aucune écriture comptable/stock.
4. **Flux confirmation** : l'aperçu initial n'est déclenché que depuis le bouton du reçu, désactivé en brouillon et en validation propriétaire en attente; la donnée affichée provient du snapshot backend. L'historique permet de réimprimer chaque version et l'owner peut corriger une commande confirmée et non annulée.
5. **PDF vectoriel** : le type d'accusé utilise un rendu dédié A4, inspiré de la disposition du modèle (identités, référence reçu et commande, date/heure, statut/type, lignes avec remise, emballages prévus/remis/rendus, consignes unitaires/totales, récapitulatif FCFA, paiements réels, observations/disclaimer et signatures). La pagination réserve une page de clôture si notes et contenu ne tiennent pas; les commandes longues sont paginées sans page finale vide.
6. **PDF source serveur** : lors d'un téléchargement PDF, le backend retrouve le reçu par son numéro unique et charge les paramètres société et les données `pdfDocument` figés dans `snapshot_json`. Les champs envoyés par le navigateur sont ignorés, hormis le logo JPEG rasterisé. Sans reçu émis en base, la fabrication d'un reçu par injection de données navigateur est refusée.
7. **Logo commun** : `app_settings.logo_path` reste l'unique source; téléversement/image compressée réservée au propriétaire (contrôle UI et vérification RBAC côté service), affichée aussi dans la marque de navigation. Le reçu et les bons de commande utilisent cette identité; le snapshot contient le logo data URL pour préserver les réimpressions.
8. **Tests** : tests source ajoutés pour la stabilité du snapshot, le PDF d'une page/paginé et le contrôle propriétaire du logo. Parité schema v23 comparée à la fixture via SQLite Python.

## Limites restantes avant d'appeler la refonte complète

- Le logo choisi dans les paramètres est stocké comme data URL compressée dans `app_settings.logo_path`; sa valeur est donc figée dans le snapshot du reçu. Les anciennes valeurs sous forme de chemin relatif `/images/...` restent dépendantes du fichier associé.
- La correction versionnée reprend les données actuelles de la commande et du client tout en conservant l'identité société du reçu original. Les détails absents du schéma (par exemple référence Mobile Money externe, RCCM/NCC ou horodatage de livraison) ne sont pas reconstruits ni inventés.
- Le schéma historique ne possède pas de snapshots clients/produits avant v23 : l'émission d'un nouveau reçu sur une ancienne commande fige l'état disponible à cette première émission (pas une reconstitution de ce qui était connu à la date de commande).
- Attributs non persistés (RCCM/NCC, livreur, heure planifiée, frais de livraison, catégories client fines) ne sont pas inventés.
- La suite Rust est ajoutée mais ne peut pas être exécutée dans cet environnement car `cargo`/`rustc` ne sont pas installés. Les validations frontend seront exécutées après les changements d'API.
