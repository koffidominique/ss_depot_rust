# RÈGLES MÉTIER DEPOTPRO V3

1. **Produits & Conditionnements** : Stock consolidé en unité de base (`stock_milli`). Les 5 conditionnements (`casier`, `carton`, `bouteille`, `pack`, `canette`) ont chacun un `coefficient_milli > 0` explicite et des tarifs propres (gros, semi-gros, détail).
2. **Achats & Réceptions** : Le bon de commande (`CMD`) ne modifie jamais le stock. Seule la réception (`REC`, totale ou partielle) incrémente le stock, met à jour le CUMP (`average_cost_num/den` exact) et crée la dette fournisseur sur la quantité réellement reçue.
3. **Ventes & Paiements mixtes** : Une vente exige une session de caisse ouverte, déduit le stock atomiquement, calcule les consignations à part (`total_deposit`), et permet les paiements mixtes (`Espèces + Wave + Orange Money + MTN`).
4. **Crédit client** : Politique explicite obligatoire (`forbidden` par défaut, `limited` avec plafond strictement défini, ou `unlimited`). Aucun crédit silencieux.
5. **Annulations & Retours** : Aucune suppression physique d'une vente validée. Annulation = contre-écriture stock + annulation créance + remboursement traçable. Retour partiel = avoir (`AVO-*`) + réintégration stock approuvée.
6. **Caisse** : Séparation stricte entre espèces physiques en tiroir (`is_cash = 1`) et flux numériques (`is_cash = 0`). Tout écart à la clôture exige un commentaire.
7. **Marge & COGS** : Calculés uniquement sur les lignes dont le coût historique (`cost_num/cost_den`) est connu ; les lignes sans coût sont comptabilisées séparément sans estimation inventée.
