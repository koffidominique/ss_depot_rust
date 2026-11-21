Tu as raison de vouloir revoir profondément le formulaire de création de produit de **DEPOTPRO**. Le produit ne doit plus être enregistré comme un simple nom, une quantité et un prix. Dans un sous-dépôt de boissons en Côte d'Ivoire, il faut distinguer clairement :

1. **La boisson** : marque, brasserie, catégorie, référence commerciale.
2. **Le contenant** : bouteille en verre, PET, canette, etc.
3. **Le volume** : 33 cl, 50 cl, 65 cl, 1 L, 1,5 L, etc.
4. **L'unité commerciale de vente** : bouteille, canette, pack, carton, casier.
5. **L'emballage de regroupement** : casier réutilisable, carton, pack plastique, etc.
6. **La consigne** : valeur de l'emballage récupérable, suivi des retours et des emballages détenus par les clients.
7. **Les prix** : achat fournisseur, vente unitaire, vente en gros, prix du conditionnement.
8. **Le stock physique** : bouteilles, casiers, emballages vides, produits pleins, retours.

L'erreur à éviter absolument est de fusionner le produit, son conditionnement commercial et son emballage consigné dans une seule table. Cela créerait des problèmes lors des ventes mixtes, du retour des casiers, de la gestion des dettes et des inventaires.

## **1. Informations recueillies sur le marché ivoirien**

Les conditionnements ne sont pas uniformes d'une marque à l'autre. Il faut donc concevoir un système où les formats sont configurables, plutôt que de coder en dur uniquement les casiers de 24 bouteilles.

Les références commercialisées par SOLIBRA illustrent bien cette diversité :

| Produit / marque | Contenant | Volume | Emballage de vente | Quantité |
| ---------------- | --------- | ------ | ------------------ | -------- |
| Beaufort         | Verre     | 33 cl  | Casier             | 24       |
| Beaufort         | Verre     | 50 cl  | Casier             | 12       |
| Beaufort         | Canette   | 33 cl  | Carton             | 24       |
| Bock             | Verre     | 33 cl  | Casier             | 24       |
| Bock             | Verre     | 50 cl  | Casier             | 12       |
| Bock             | Verre     | 65 cl  | Casier             | 12       |
| Bock             | Verre     | 100 cl | Casier             | 12       |
| Bock             | Canette   | 33 cl  | Carton             | 24       |
| Bock             | Canette   | 50 cl  | Carton             | 24       |
| Racines          | Verre     | 33 cl  | Casier             | 24       |
| Racines          | Verre     | 50 cl  | Casier             | 20       |
| Guinness         | Verre     | 33 cl  | Casier             | 24       |
| Guinness         | Verre     | 65 cl  | Casier             | 12       |
| Guinness         | Canette   | 33 cl  | Carton             | 24       |
| Valpierre        | Verre     | 50 cl  | Casier             | 12       |
| Valpierre        | Verre     | 100 cl | Casier             | 12       |

Ces exemples démontrent qu'il faut permettre des conditionnements de 12, 20, 24 bouteilles et d'autres quantités, avec ou sans consigne.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://solibrachezvous.ci\&sz=32)

Solibra Chez Vous+2



SOLIBRA commercialise aussi des boissons énergisantes, maltées, gazeuses, des vins et d'autres boissons. La catégorie du produit ne doit donc pas être limitée à la bière.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.solibrachezvous.ci\&sz=32)

Solibra Chez Vous+1



**Décision d'architecture :** chaque référence produit doit être définie par une combinaison précise de marque, recette/variante, volume, contenant, emballage commercial et nombre d'unités par emballage.

# **2. Le nouveau formulaire de création produit**

Je recommande un formulaire premium divisé en 6 étapes, avec une interface dynamique. L'utilisateur ne voit que les champs pertinents selon ses choix.

## **Créer une nouvelle référence produit**

1\. Identité

2\. Contenant

3\. Emballage

Identification commerciale

Définir la brasserie, la marque et la référence exacte de la boisson.

Brasserie / fabricant \*

SOLIBRA ▾

Marque \*

BOCK ▾

Nom commercial / variante

Bock Lager

Catégorie \*

Bière ▾

Informations complémentaires

Code produit, statut actif, image, description.

## **Étape 1 — Identité du produit**

| Champ                 | Type                      | Obligatoire |
| --------------------- | ------------------------- | ----------- |
| Brasserie / fabricant | Liste + création          | Oui         |
| Marque                | Liste liée à la brasserie | Oui         |
| Nom commercial        | Texte                     | Oui         |
| Variante / parfum     | Texte ou liste            | Non         |
| Catégorie             | Liste configurable        | Oui         |
| Sous-catégorie        | Liste configurable        | Non         |
| Code SKU interne      | Généré automatiquement    | Oui         |
| Code-barres EAN/UPC   | Texte                     | Non         |
| Description           | Texte                     | Non         |
| Image du produit      | Image                     | Non         |
| Statut                | Actif / inactif           | Oui         |

### **Catégories recommandées**

- Bière
- Boisson gazeuse / sucrerie
- Eau minérale
- Eau gazeuse
- Jus
- Nectar
- Boisson énergisante
- Boisson maltée sans alcool
- Vin
- Champagne / mousseux
- Spiritueux
- Cocktail prêt à boire
- Autres

La catégorie et la sous-catégorie doivent être administrables par l'Owner, afin de ne pas obliger à modifier le code à chaque apparition d'une nouvelle famille de produits.

## **Étape 2 — Caractéristiques de la boisson et du contenant**

Cette étape est conditionnelle.

### **Type de contenant**

- Bouteille en verre
- Bouteille en plastique (PET)
- Canette aluminium
- Tetrapak / carton liquide
- Sachet
- Fût
- Autre

### **Volume du contenant**

Ne pas utiliser une liste fixe limitée à 33 cl, 50 cl, 1 L et 1,5 L.

Utiliser un volume numérique normalisé en millilitres :

| Affichage | Valeur stockée |
| --------- | -------------- |
| 25 cl     | 250 ml         |
| 30 cl     | 300 ml         |
| 33 cl     | 330 ml         |
| 50 cl     | 500 ml         |
| 65 cl     | 650 ml         |
| 1 L       | 1 000 ml       |
| 1,5 L     | 1 500 ml       |
| 2 L       | 2 000 ml       |

L'utilisateur pourra saisir un volume personnalisé.

### **Champs complémentaires**

| Champ                                     | Utilité                            |
| ----------------------------------------- | ---------------------------------- |
| Matériau                                  | Verre, PET, aluminium, carton      |
| Contenant réutilisable                    | Oui / Non                          |
| Contenant consigné                        | Oui / Non                          |
| Valeur de consigne du contenant           | FCFA                               |
| Contenant recyclable                      | Oui / Non                          |
| Taux d'alcool                             | % vol.                             |
| Composition / ingrédients                 | Facultatif                         |
| Couleur / type de boisson                 | Blonde, brune, tonic, orange, etc. |
| Température de conservation               | Facultatif                         |
| Date d'expiration / durée de conservation | Selon produit                      |

**Attention :** le verre consigné, le verre perdu et le verre recyclable sont trois notions différentes. Le système doit pouvoir les distinguer.

## **Étape 3 — Emballage commercial et unités de vente**

C'est l'étape la plus importante pour ton application.

Il faut distinguer **l'emballage commercial** de **l'emballage consigné**.

### **A. Emballage commercial**

Type d'emballage :

- Casier plastique
- Carton
- Pack plastique
- Film rétractable
- Palette
- Vente à l'unité
- Autre

| Champ                      | Exemple          |
| -------------------------- | ---------------- |
| Type d'emballage           | Casier plastique |
| Nombre de bouteilles       | 24               |
| Volume de chaque bouteille | 330 ml           |
| Volume total               | 7 920 ml         |
| Emballage réutilisable     | Oui              |
| Emballage consigné         | Oui              |
| Emballage fourni par       | SOLIBRA          |
| Emballage standard         | Oui              |

Exemple de référence produit :

> BOCK LAGER — Bouteille verre 33 cl — Casier de 24

Autre référence :

> BOCK LAGER — Canette 33 cl — Carton de 24

Même boisson, mais **deux références commerciales distinctes**, parce que le contenant et le système d'emballage sont différents.

### **B. Gestion des emballages**

L'emballage doit disposer de sa propre fiche.

| Champ              | Exemple                 |
| ------------------ | ----------------------- |
| Nom                | Casier BOCK 24          |
| Type               | Casier plastique        |
| Capacité           | 24 bouteilles           |
| Réutilisable       | Oui                     |
| Consigné           | Oui                     |
| Valeur de consigne | 1 000 FCFA              |
| Propriétaire       | Brasserie               |
| Code interne       | EMB-BOCK-24             |
| État               | Bon / endommagé / perdu |

La valeur de consigne est un paramètre qui peut varier suivant le fournisseur, le type de casier et les accords commerciaux.

### **C. Emballage carton**

Dans le cas d'un carton non consigné :

- Type : carton
- Nombre de bouteilles : 24
- Réutilisable : Non
- Consigné : Non
- Valeur de consigne : 0 FCFA

Le système doit permettre de créer un carton de 6, 12, 24 ou toute autre quantité.

## **Étape 4 — Configuration des unités de vente**

Il faut prévoir plusieurs unités commerciales par produit.

Prenons un produit dont le conditionnement est un casier de 24 bouteilles de 33 cl.

## **Exemple de configuration**

BOCK 33 cl — Casier de 24

| Unité de vente | Contenu       |
| -------------- | ------------- |
| Bouteille      | 1 bouteille   |
| Demi-casier    | 12 bouteilles |
| Casier         | 24 bouteilles |

Les unités de vente sont configurables. Le demi-casier est une unité de vente virtuelle et ne nécessite pas un emballage physique distinct.

Le système devra également supporter les ventes mélangées :

- 12 bouteilles de Beaufort + 12 bouteilles de Bock
- 6 bouteilles de Guinness + 6 bouteilles de Castel
- 1 casier complet + 5 bouteilles supplémentaires
- 1 carton de canettes + 3 canettes

La vente mixte doit être traitée comme une composition de lignes de vente, et non comme une nouvelle référence produit créée à chaque combinaison.

## **Étape 5 — Prix d'achat, prix de vente et consigne**

Le formulaire devrait intégrer un tableau de tarification, plutôt qu'un seul champ prix.

| Tarif                    | Valeur       | Utilisation            |
| ------------------------ | ------------ | ---------------------- |
| Prix d'achat fournisseur | 7 500        | Achat du casier        |
| Prix de vente casier     | 9 000        | Vente casier complet   |
| Prix de vente bouteille  | 400          | Vente unitaire         |
| Prix demi-casier         | 4 800        | Vente de 12 bouteilles |
| Consigne casier          | 1 000        | Emballage récupérable  |
| Consigne bouteille       | 0 ou montant | Selon politique        |
| Prix minimum autorisé    | 8 500        | Protection de marge    |
| Marge brute estimée      | Calculée     | Indicateur             |

Les prix ne doivent pas être des valeurs définitives stockées uniquement dans le produit. Il faut conserver l'historique des prix.

### **Règles de calcul**

Prix de vente casier = prix des bouteilles + emballage, selon la tarification configurée.

Marge brute :

\\[ \text{Marge brute} = \text{Prix de vente HT ou TTC} - \text{Coût d'achat} \\]

Pour la consigne, il faut éviter de la considérer comme un chiffre d'affaires normal.

Exemple :

- Casier de boissons : 9 000 FCFA
- Consigne : 1 000 FCFA
- Total facturé au client : 10 000 FCFA
- Retour du casier : remboursement ou déduction de 1 000 FCFA

La consigne doit être suivie dans un compte distinct, avec une logique de dette d'emballage ou de dépôt récupérable, et non incorporée à la marge commerciale.

## **Étape 6 — Gestion et validation**

Derniers paramètres :

| Champ                       | Fonction                    |
| --------------------------- | --------------------------- |
| Stock initial               | Quantité à l'enregistrement |
| Stock minimum               | Seuil d'alerte              |
| Stock maximum               | Limite facultative          |
| Fournisseur principal       | Fournisseur habituel        |
| Emplacement                 | Zone / rayon / dépôt        |
| Autoriser vente à crédit    | Oui / Non                   |
| Autoriser vente unitaire    | Oui / Non                   |
| Autoriser vente mixte       | Oui / Non                   |
| Produit actif               | Oui / Non                   |
| Produit soumis à expiration | Oui / Non                   |

Le stock initial doit être enregistré via une **opération d'inventaire initial**, et non directement dans le champ produit. Cela garantit la traçabilité des mouvements.

# **3. Architecture de la base de données relationnelle**

Je recommande une architecture normalisée en plusieurs entités. Elle permettra de gérer les catalogues des brasseries, les prix, les emballages consignés et les évolutions futures sans rendre la base difficile à maintenir.

## **Modèle conceptuel**

\#chatgpt-mermaid-\_r_24m\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_24m\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_24m\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_24m\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_24m\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_24m\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_24m\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_24m\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_24m\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_24m\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_24m\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_24m\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_24m\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_24m\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_24m\_ p{margin:0;}#chatgpt-mermaid-\_r_24m\_ .entityBox{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_24m\_ .relationshipLabelBox{fill:rgb(48, 48, 48);opacity:0.7;background-color:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_24m\_ .relationshipLabelBox rect{opacity:0.5;}#chatgpt-mermaid-\_r_24m\_ .labelBkg{background-color:rgba(48, 48, 48, 0.5);}#chatgpt-mermaid-\_r_24m\_ .edgeLabel{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_24m\_ .edgeLabel .label rect{fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_24m\_ .edgeLabel .label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_24m\_ .edgeLabel .label{fill:rgb(31, 78, 148);font-size:14px;}#chatgpt-mermaid-\_r_24m\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_24m\_ .edge-pattern-dashed{stroke-dasharray:8,8;}#chatgpt-mermaid-\_r_24m\_ .node rect,#chatgpt-mermaid-\_r_24m\_ .node circle,#chatgpt-mermaid-\_r_24m\_ .node ellipse,#chatgpt-mermaid-\_r_24m\_ .node polygon{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-\_r_24m\_ .relationshipLine{stroke:rgb(175, 175, 175);stroke-width:1px;fill:none;}#chatgpt-mermaid-\_r_24m\_ .marker{fill:none!important;stroke:rgb(175, 175, 175)!important;stroke-width:1;}#chatgpt-mermaid-\_r_24m\_ [data-look=neo].labelBkg{background-color:rgba(48, 48, 48, 0.5);}#chatgpt-mermaid-\_r_24m\_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_24m\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_24m\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_24m\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_24m\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_24m\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_24m\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_24m\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}BREWERIESBRANDSPRODUCTSPRODUCT_CATEGORIESPRODUCT_VARIANTSCONTAINER_TYPESPACKAGING_CONFIGURATIONSPACKAGING_TYPESSALES_UNITSDEPOSIT_RULESPRODUCT_SUPPLIERSPRICE_HISTORYSTOCK_MOVEMENTSPACKAGING_STOCK_MOVEMENTSownsmarketsclassifieshasusespackaged_asdefinesenablesappliessupplied_bypricedtrackedtracked

## **Les tables principales**

### **1.&#x20;**`breweries`**&#x20;— Brasseries et fabricants**

| Colonne      | Type       |
| ------------ | ---------- |
| id           | INTEGER PK |
| name         | TEXT       |
| short_name   | TEXT       |
| country_code | TEXT       |
| address      | TEXT       |
| phone        | TEXT       |
| email        | TEXT       |
| website      | TEXT       |
| active       | BOOLEAN    |
| created_at   | DATETIME   |
| updated_at   | DATETIME   |

Exemples :

- SOLIBRA
- Brassivoire
- Autres fabricants et importateurs

Une brasserie ne doit pas être obligatoirement une entreprise produisant de la bière. Le terme `manufacturer` ou `supplier_brand_owner` peut être plus universel dans le modèle technique.

### **2.&#x20;**`brands`**&#x20;— Marques**

| Colonne     | Type       |
| ----------- | ---------- |
| id          | INTEGER PK |
| brewery_id  | INTEGER FK |
| name        | TEXT       |
| description | TEXT       |
| logo_path   | TEXT       |
| active      | BOOLEAN    |

Une brasserie peut posséder plusieurs marques.

Exemple :

SOLIBRA → BOCK, BEAUFORT, CASTEL, RACINES, DOPPEL, etc.

La marque doit être liée au fabricant, mais il faut permettre les marques importées dont le fabricant n'est pas une brasserie ivoirienne.

### **3.&#x20;**`product_categories`**&#x20;— Catégories**

| Colonne   | Type            |
| --------- | --------------- |
| id        | INTEGER PK      |
| parent_id | INTEGER FK NULL |
| name      | TEXT            |
| slug      | TEXT UNIQUE     |
| active    | BOOLEAN         |

Permet une structure hiérarchique :

\- Boissons

- Boissons alcoolisées
  - Bières
  - Vins
  - Spiritueux
- Boissons sans alcool
  - Sodas
  - Eaux
  - Jus
  - Énergisantes
  - Maltées

### **4.&#x20;**`products`**&#x20;— Identité du produit**

Cette table décrit la boisson indépendamment de ses conditionnements.

| Colonne            | Type         |
| ------------------ | ------------ |
| id                 | INTEGER PK   |
| brewery_id         | INTEGER FK   |
| brand_id           | INTEGER FK   |
| category_id        | INTEGER FK   |
| name               | TEXT         |
| variant            | TEXT NULL    |
| description        | TEXT         |
| alcohol_percentage | DECIMAL NULL |
| barcode_base       | TEXT NULL    |
| image_path         | TEXT NULL    |
| active             | BOOLEAN      |
| created_at         | DATETIME     |
| updated_at         | DATETIME     |

Exemple :

- Brasserie : SOLIBRA
- Marque : BOCK
- Produit : Bock Lager
- Variante : Blonde

### **5.&#x20;**`product_variants`**&#x20;— Références physiques vendables**

C'est cette table qui distingue les différents formats d'une même boisson.

| Colonne                    | Type         |
| -------------------------- | ------------ |
| id                         | INTEGER PK   |
| product_id                 | INTEGER FK   |
| sku                        | TEXT UNIQUE  |
| container_type_id          | INTEGER FK   |
| volume_ml                  | INTEGER      |
| container_material         | TEXT         |
| container_returnable       | BOOLEAN      |
| container_deposit_amount   | INTEGER      |
| container_deposit_currency | TEXT         |
| barcode                    | TEXT NULL    |
| net_weight_g               | INTEGER NULL |
| active                     | BOOLEAN      |
| created_at                 | DATETIME     |

Exemple :

| Produit    | Variante      | SKU          |
| ---------- | ------------- | ------------ |
| Bock Lager | Verre 33 cl   | BOCK-GL-330  |
| Bock Lager | Verre 50 cl   | BOCK-GL-500  |
| Bock Lager | Verre 65 cl   | BOCK-GL-650  |
| Bock Lager | Verre 100 cl  | BOCK-GL-1000 |
| Bock Lager | Canette 33 cl | BOCK-CA-330  |
| Bock Lager | Canette 50 cl | BOCK-CA-500  |

Les codes SKU doivent être uniques et stables, même si le nom commercial change.

### **6.&#x20;**`container_types`**&#x20;— Types de contenants**

| id | name           | material  | reusable_default |
| -- | -------------- | --------- | ---------------- |
| 1  | Bouteille      | Verre     | Oui              |
| 2  | Bouteille      | PET       | Non              |
| 3  | Canette        | Aluminium | Non              |
| 4  | Carton liquide | Carton    | Non              |
| 5  | Sachet         | Plastique | Non              |

Cette table est configurable.

### **7.&#x20;**`packaging_types`**&#x20;— Types d'emballages**

| id | name                 | reusable | returnable   |
| -- | -------------------- | -------- | ------------ |
| 1  | Casier plastique     | Oui      | Oui          |
| 2  | Carton               | Non      | Non          |
| 3  | Pack film plastique  | Non      | Non          |
| 4  | Palette              | Oui      | Selon accord |
| 5  | Vente sans emballage | Non      | Non          |

## **8.&#x20;**`packaging_configurations`**&#x20;— Configuration commerciale des emballages**

C'est une table fondamentale.

Elle décrit comment les variantes physiques sont vendues.

| Colonne                  | Type         |
| ------------------------ | ------------ |
| id                       | INTEGER PK   |
| variant_id               | INTEGER FK   |
| packaging_type_id        | INTEGER FK   |
| package_name             | TEXT         |
| units_per_package        | INTEGER      |
| package_sku              | TEXT         |
| package_barcode          | TEXT         |
| package_reusable         | BOOLEAN      |
| package_returnable       | BOOLEAN      |
| package_deposit_amount   | INTEGER      |
| package_deposit_currency | TEXT         |
| package_cost             | INTEGER NULL |
| active                   | BOOLEAN      |

Exemple :

| Variante           | Emballage              | Quantité |
| ------------------ | ---------------------- | -------- |
| Bock 33 cl verre   | Casier                 | 24       |
| Bock 33 cl verre   | Demi-casier virtuel    | 12       |
| Bock 33 cl verre   | Bouteille individuelle | 1        |
| Bock 33 cl canette | Carton                 | 24       |
| Bock 33 cl canette | Canette individuelle   | 1        |

Il ne faut pas créer une variante physique distincte pour le demi-casier. Il s'agit d'une unité commerciale et d'une règle de conversion.

### **Exemple de conversion**

Pour un casier de 24 :

- 1 casier = 24 bouteilles
- 1 demi-casier = 12 bouteilles
- 1 bouteille = 1 bouteille

La base de données doit enregistrer les ventes en unités de base, c'est-à-dire en bouteilles, canettes ou unités physiques.

# **4. Architecture des consignes : ne pas la simplifier excessivement**

Il existe plusieurs types d'emballages récupérables.

[beer crates for sale: Durable, Stackable & Customizable](https://images.openai.com/static-rsc-4/fbcB7XeutF-zTo213NRYYM766gY9S15tRe5Eke5xYj3klVxMW0dwROOE1a2zi8l0aWs1HdC8Ya8o6xUgZNS3E40vwRGXYyWqzQhY6ITbqrqIv2rNwKoGJsN6sTGLa0r_pxXv3C0PACVa3zjQ5hMHUmR1a9pqsa4bZDb4bq7yVQI?purpose=inline)

**Casier de bière**

Emballage logistique réutilisable. Il peut être consigné et retourné indépendamment des bouteilles.

[San Miguel Bottles 24x33cl. Returnable - Hydra Distribución](https://images.openai.com/static-rsc-4/Ouu7NVNd0jusOG4DgLl25qU1HjprXfTTzibW-gkgloI1wgakxdyFe7n5T3cRjQ2MkdgJvEzCZWvV_dutT3RtkB6DHg8tFzJlVCDDppFHpKhC8LgEwhKfhMFzipxnsbo8Qj16eeqBC8JUif8NAWmR7HzpCDczoF7mBx4_5P-qx0A?purpose=inline)

**Bouteille en verre consignée**

La bouteille peut avoir une valeur de consigne individuelle distincte du casier.

[Flaschenkarton für 24 Flaschen 0,33 - 0,5 L mit Gefache](https://images.openai.com/static-rsc-4/Ec4ITSmPj_ryy0kA5r6JGuRIKKGzY5x3BpmBtKdsqf2Aa7TSKz2_YVFugGZae5FluewysVkrzbwa-lZSKWFVBIS4wk3OrCUvPIehCo_YzDeQ46l-EXR9y8NfFoM0I-gLzeK9Lq1W6T_Ncta3NeVljEH2554U5XrGyBOTaI8BgNc?purpose=inline)

**Carton non consigné**

Le carton est normalement considéré comme consommable, mais cette règle doit rester configurable.

## **Tables dédiées**

### `packaging_assets`

Cette table représente les types d'emballages physiques gérés.

| Colonne           | Type         |
| ----------------- | ------------ |
| id                | INTEGER PK   |
| name              | TEXT         |
| packaging_type_id | INTEGER FK   |
| owner_type        | TEXT         |
| owner_id          | INTEGER NULL |
| capacity          | INTEGER      |
| deposit_value     | INTEGER      |
| currency          | TEXT         |
| returnable        | BOOLEAN      |
| active            | BOOLEAN      |

### `deposit_rules`

Les règles de consigne peuvent varier selon le fournisseur et la période.

| Colonne                    | Type            |
| -------------------------- | --------------- |
| id                         | INTEGER PK      |
| variant_id                 | INTEGER FK NULL |
| packaging_configuration_id | INTEGER FK NULL |
| packaging_asset_id         | INTEGER FK      |
| amount                     | INTEGER         |
| currency                   | TEXT            |
| effective_from             | DATE            |
| effective_to               | DATE NULL       |
| supplier_id                | INTEGER NULL    |
| active                     | BOOLEAN         |

Cette conception permet de modifier la consigne sans modifier les anciennes transactions.

### `packaging_movements`

Chaque mouvement de casier ou emballage doit être enregistré.

| Colonne            | Type         |
| ------------------ | ------------ |
| id                 | INTEGER PK   |
| packaging_asset_id | INTEGER FK   |
| movement_type      | TEXT         |
| quantity           | INTEGER      |
| source_type        | TEXT         |
| source_id          | INTEGER      |
| customer_id        | INTEGER NULL |
| supplier_id        | INTEGER NULL |
| unit_deposit_value | INTEGER      |
| total_value        | INTEGER      |
| date               | DATETIME     |
| user_id            | INTEGER      |
| notes              | TEXT         |

Mouvements possibles :

- Réception emballages
- Livraison au client
- Retour client
- Retour fournisseur
- Perte
- Casse
- Ajustement inventaire
- Transfert entre dépôts

**Le stock de casiers ne doit jamais être calculé uniquement à partir du stock de boissons.** Il doit avoir son propre registre de mouvements.

# **5. Gestion des fournisseurs et prix d'achat**

Un produit peut être acheté auprès de plusieurs fournisseurs. Le prix d'achat peut changer au cours du temps.

Je recommande les tables suivantes.

### `suppliers`

| Colonne        | Type       |
| -------------- | ---------- |
| id             | INTEGER PK |
| name           | TEXT       |
| supplier_type  | TEXT       |
| phone          | TEXT       |
| address        | TEXT       |
| contact_person | TEXT       |
| payment_terms  | TEXT       |
| active         | BOOLEAN    |

### `product_suppliers`

Relation entre produit et fournisseur.

| Colonne                    | Type       |
| -------------------------- | ---------- |
| id                         | INTEGER PK |
| product_id                 | INTEGER FK |
| supplier_id                | INTEGER FK |
| supplier_product_code      | TEXT       |
| preferred_supplier         | BOOLEAN    |
| purchase_unit              | TEXT       |
| units_per_purchase_package | INTEGER    |
| active                     | BOOLEAN    |

### `price_history`

| Colonne                    | Type            |
| -------------------------- | --------------- |
| id                         | INTEGER PK      |
| variant_id                 | INTEGER FK      |
| supplier_id                | INTEGER FK NULL |
| packaging_configuration_id | INTEGER FK NULL |
| price_type                 | TEXT            |
| amount                     | INTEGER         |
| currency                   | TEXT            |
| effective_from             | DATETIME        |
| effective_to               | DATETIME NULL   |
| recorded_by                | INTEGER         |

Types de prix :

- `PURCHASE`
- `RETAIL`
- `WHOLESALE`
- `UNIT`
- `PACKAGE`
- `MINIMUM_SELLING_PRICE`

Les prix en FCFA devraient être stockés en entiers, pas en nombres flottants.

Exemple : 10 500 FCFA → `10500`.

Cela évite les erreurs d'arrondi.

# **6. La structure de stock que je recommande**

Pour DEPOTPRO, il faut dissocier quatre stocks :

| Stock                            | Exemple                  |
| -------------------------------- | ------------------------ |
| Stock de boissons pleines        | 30 casiers Bock 33 cl    |
| Stock de bouteilles vides        | 50 bouteilles récupérées |
| Stock de casiers vides           | 15 casiers Bock          |
| Stock d'emballages non consignés | Cartons, packs           |

### **Tables**

- `stock_locations` : dépôt, magasin, zone
- `stock_balances` : état courant du stock, optimisé pour consultation
- `stock_movements` : registre historique immuable
- `inventory_sessions` : inventaires
- `inventory_lines` : comptage réel
- `stock_adjustments` : corrections autorisées

La table `stock_movements` doit être la source de vérité historique.

La table `stock_balances` est une projection optimisée, reconstruisible à partir des mouvements.

### **Types de mouvements**

```
PURCHASE_RECEIPT
SALE
SALE_RETURN
PURCHASE_RETURN
TRANSFER_IN
TRANSFER_OUT
INVENTORY_ADJUSTMENT
DAMAGED
EXPIRED
CONSUMPTION
```

# **7. Proposition de schéma SQL SQLite**

Voici une base concrète pour les principales entités. Elle constitue un noyau de conception, à adapter aux migrations et conventions déjà présentes dans le dépôt.

```
PRAGMA foreign_keys = ON;

CREATE TABLE breweries (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    short_name TEXT,
    country_code TEXT NOT NULL DEFAULT 'CI',
    address TEXT,
    phone TEXT,
    website TEXT,
    active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE brands (
    id INTEGER PRIMARY KEY,
    brewery_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (brewery_id)
        REFERENCES breweries(id),
    UNIQUE (brewery_id, name)
);

CREATE TABLE product_categories (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (parent_id)
        REFERENCES product_categories(id)
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    brewery_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    variant TEXT,
    description TEXT,
    alcohol_percentage REAL,
    image_path TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (brewery_id)
        REFERENCES breweries(id),
    FOREIGN KEY (brand_id)
        REFERENCES brands(id),
    FOREIGN KEY (category_id)
        REFERENCES product_categories(id)
);

CREATE TABLE container_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    material TEXT NOT NULL,
    reusable_default INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (name, material)
);

CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    container_type_id INTEGER NOT NULL,
    volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
    container_returnable INTEGER NOT NULL DEFAULT 0,
    container_deposit_amount INTEGER NOT NULL DEFAULT 0,
    barcode TEXT UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (product_id)
        REFERENCES products(id),
    FOREIGN KEY (container_type_id)
        REFERENCES container_types(id)
);

CREATE TABLE packaging_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    reusable INTEGER NOT NULL DEFAULT 0,
    returnable INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE packaging_configurations (
    id INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL,
    packaging_type_id INTEGER NOT NULL,
    package_name TEXT NOT NULL,
    units_per_package INTEGER NOT NULL
        CHECK (units_per_package > 0),
    package_sku TEXT UNIQUE,
    package_barcode TEXT,
    package_reusable INTEGER NOT NULL DEFAULT 0,
    package_returnable INTEGER NOT NULL DEFAULT 0,
    package_deposit_amount INTEGER NOT NULL DEFAULT 0,
    package_cost INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id),
    FOREIGN KEY (packaging_type_id)
        REFERENCES packaging_types(id)
);

CREATE TABLE price_history (
    id INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL,
    packaging_configuration_id INTEGER,
    supplier_id INTEGER,
    price_type TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'XOF',
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id),
    FOREIGN KEY (packaging_configuration_id)
        REFERENCES packaging_configurations(id)
);
```

Ce schéma constitue le noyau. Il faut ensuite ajouter les tables de fournisseurs, de consignes, de stock, de clients, de ventes, d'achats et de retours.

# **8. Comment le formulaire doit fonctionner dans DEPOTPRO**

Le formulaire doit être intelligent et éviter les champs inutiles.

### **Exemple de parcours utilisateur**

## **Création d'une bière en bouteille consignée**

1. Choisir la brasserie : SOLIBRA
2. Choisir la marque : BOCK
3. Choisir la catégorie : Bière
4. Nom : Bock Lager
5. Contenant : Bouteille en verre
6. Volume : 33 cl
7. Contenant consigné : Oui
8. Type d'emballage : Casier plastique
9. Nombre de bouteilles : 24
10. Casier consigné : Oui
11. Valeur consigne casier : 1 000 FCFA
12. Prix achat : 7 500 FCFA
13. Prix vente casier : 9 000 FCFA
14. Prix vente bouteille : 400 FCFA
15. Enregistrer

### **Comportement dynamique**

**Si le contenant est une canette :**

- Masquer les champs de consigne bouteille si non applicable.
- Afficher le matériau aluminium.
- Demander le volume.
- Permettre carton, pack ou vente unitaire.

**Si le contenant est une bouteille PET :**

- Afficher le matériau plastique.
- Volume personnalisable.
- Consigne désactivée par défaut, mais configurable.
- Emballage carton, pack ou unité.

**Si le contenant est une bouteille en verre :**

- Demander si la bouteille est consignée.
- Demander la valeur de consigne si applicable.
- Permettre la vente en casier, carton ou bouteille.
- Autoriser plusieurs configurations d'emballage pour la même variante.

**Si l'emballage est un casier :**

- Demander le nombre de bouteilles.
- Définir le type de casier.
- Activer la consigne.
- Saisir la valeur du casier.
- Permettre le suivi des casiers retournés, perdus, cassés et détenus par les clients.

**Si l'emballage est un carton :**

- Demander le nombre de bouteilles ou canettes.
- Définir son coût éventuel.
- Désactiver la consigne par défaut.
- Permettre une configuration spéciale si le carton est récupérable.

# **9. Améliorations supplémentaires que je recommande**

Voici les champs que j'ajouterais à ton cahier des charges initial.

| Champ                    | Pourquoi                                    |
| ------------------------ | ------------------------------------------- |
| SKU unique               | Identification interne fiable               |
| Code-barres              | Scan rapide en vente et inventaire          |
| Volume en ml             | Calculs et comparaisons fiables             |
| Unité de base de stock   | Éviter les erreurs de conversion            |
| Unités par emballage     | Calcul de stock                             |
| Coût unitaire calculé    | Analyse de marge                            |
| Fournisseur principal    | Approvisionnement                           |
| Historique des prix      | Évolution des marges                        |
| Prix minimum de vente    | Protection commerciale                      |
| Date d'expiration        | Gestion des boissons périssables            |
| Lot de fabrication       | Traçabilité                                 |
| Statut actif/inactif     | Ne pas supprimer les références historiques |
| Image du produit         | Reconnaissance visuelle                     |
| Variante / parfum        | Différencier les produits                   |
| Emballage consigné       | Suivi des retours                           |
| Valeur de consigne       | Comptabilité des dépôts                     |
| Produit substituable     | Gestion des ruptures                        |
| Unité de vente autorisée | Bouteille, casier, carton, pack             |
| Conversion d'unités      | Vente et inventaire                         |

### **Champs à ne pas mettre directement dans la fiche produit**

Certains éléments ne doivent pas être stockés directement dans `products` :

- Quantité actuelle en stock
- Quantité de casiers actuellement chez les clients
- Dette actuelle du client
- Prix d'achat de la dernière facture, comme seule valeur
- Prix de vente historique
- Nombre de retours de casiers
- Valeur totale des consignes actuellement détenues

Ce sont des données transactionnelles ou des soldes calculés. Elles doivent appartenir à des tables de mouvements, factures, inventaires ou comptes clients.

# **10. Architecture cible de l'écran**

Je recommande un écran premium de création de produit avec un formulaire en plusieurs sections.

## **Nouvelle référence produit**

Brouillon

Créer une référence de produit et ses conditionnements commerciaux.

**Identité commerciale**

Brasserie, marque, catégorie et variante

**Caractéristiques physiques**

Contenant, matériau, volume et consigne

**Conditionnements**

Casier, carton, pack, unités par emballage

**Tarification**

Prix achat, prix de vente, marge, consigne

**Stock et approvisionnement**

Fournisseur, seuils, emplacement, stock initial

## **Vue de prévisualisation automatique**

Avant de valider, l'application devrait générer un résumé :

## **BOCK LAGER — 33 cl**

SOLIBRA · Bière blonde

Contenant

**Verre consigné**

Conditionnement

**Casier × 24**

Prix d'achat

**7 500 FCFA**

Prix de vente

**9 000 FCFA**

Consigne casier

**1 000 FCFA**

Marge brute estimée

**1 500 FCFA**

Prix total client avec consigne

**10 000 FCFA**

# **11. Prompt d'implémentation pour ton agent IA**

Tu peux transmettre ce prompt à ton agent de développement pour qu'il travaille dans le repository `ss_depot_rust`.

# MASTER PROMPT — REFACTORING DU CATALOGUE PRODUITS ET CONDITIONNEMENTS DE DEPOTPRO

## 1. CONTEXTE

Tu travailles sur le repository :

[https://github.com/koffidominique/ss_depot_rust.git](https://github.com/koffidominique/ss_depot_rust.git)

Application DEPOTPRO, développée avec React, TypeScript, Rust, Axum et SQLite.

L'objectif est de moderniser complètement le système de création, modification, consultation et gestion des produits afin de l'adapter aux réalités commerciales des sous-dépôts de boissons en Côte d'Ivoire.

Le système actuel de produits doit être audité avant toute modification.

Ne jamais supposer que les tables, composants ou API actuels peuvent être remplacés sans vérification.

---

## 2. OBJECTIFS FONCTIONNELS

Mettre en place un catalogue structuré permettant de gérer :

- Les brasseries et fabricants.
- Les marques.
- Les catégories et sous-catégories de boissons.
- Les produits commerciaux.
- Les variantes physiques.
- Les contenants.
- Les volumes.
- Les conditionnements.
- Les casiers et cartons.
- Les emballages consignés.
- Les bouteilles consignées.
- Les prix d'achat.
- Les prix de vente.
- Les fournisseurs.
- Les unités commerciales.
- Les conversions.
- Les codes SKU et codes-barres.
- Les mouvements de stock.
- Les mouvements d'emballages.
- Les historiques de prix.

---

## 3. AUDIT OBLIGATOIRE

Avant d'écrire du code :

1. Analyser l'architecture existante.
2. Identifier le modèle Product existant.
3. Identifier les migrations SQLite.
4. Identifier les endpoints Axum.
5. Identifier les repositories et services Rust.
6. Identifier les formulaires React existants.
7. Identifier le système de stock.
8. Identifier le système de ventes.
9. Identifier le système d'achats.
10. Identifier le système de retours et consignes.
11. Identifier les composants UI réutilisables.
12. Identifier les conventions de validation et d'erreur.

Produire un rapport précis des fichiers concernés.

Ne pas créer une seconde architecture de produits parallèle à celle déjà existante.

---

## 4. MODÈLE DE DONNÉES CIBLE

Créer ou adapter les entités suivantes :

- breweries
- brands
- product_categories
- products
- container_types
- product_variants
- packaging_types
- packaging_configurations
- sales_units
- product_suppliers
- price_history
- packaging_assets
- deposit_rules
- packaging_movements
- stock_locations
- stock_movements
- stock_balances

Toutes les relations doivent être normalisées.

Toutes les clés étrangères doivent être activées dans SQLite.

Les migrations doivent être versionnées, réversibles lorsque possible, et compatibles avec les données existantes.

Ne jamais supprimer des données historiques.

---

## 5. FORMULAIRE DE CRÉATION PRODUIT

Créer un formulaire moderne, professionnel, responsive et dynamique, divisé en sections.

### SECTION A — IDENTITÉ

Champs :

- Brasserie / fabricant
- Marque
- Nom commercial
- Variante / parfum
- Catégorie
- Sous-catégorie
- SKU généré
- Code-barres
- Description
- Image
- Statut actif

La sélection de marque doit être filtrée par fabricant.

Autoriser la création rapide d'une brasserie, marque ou catégorie sans quitter le formulaire, avec validation des permissions.

### SECTION B — CONTENANT

Champs :

- Type de contenant
- Matériau
- Volume en ml
- Contenant réutilisable
- Contenant consigné
- Valeur de consigne
- Taux d'alcool
- Autres caractéristiques

Types :

- Verre
- PET
- Canette
- Carton liquide
- Sachet
- Fût
- Autre

Le volume doit être personnalisable.

### SECTION C — CONDITIONNEMENT

Permettre de créer plusieurs conditionnements par variante.

Champs :

- Type d'emballage
- Nom
- Quantité d'unités
- SKU emballage
- Code-barres
- Réutilisable
- Consigné
- Valeur de consigne
- Coût d'emballage
- Statut

Exemples :

- Casier de 24 bouteilles
- Casier de 12 bouteilles
- Carton de 24 canettes
- Pack de 6
- Vente unitaire

Ne pas coder en dur les quantités.

### SECTION D — UNITÉS DE VENTE

Définir les unités de vente autorisées :

- Bouteille
- Canette
- Pack
- Carton
- Casier
- Demi-casier
- Unité personnalisée

Définir les conversions vers l'unité de stock de base.

Les ventes mixtes doivent être supportées.

### SECTION E — PRIX

Champs :

- Fournisseur
- Prix d'achat
- Unité d'achat
- Prix de vente unitaire
- Prix de vente emballage
- Prix de gros
- Prix minimum
- Valeur de consigne
- Marge brute estimée

Créer un historique de prix.

Stocker les montants en entiers FCFA.

Ne jamais écraser l'historique des prix.

### SECTION F — STOCK ET APPROVISIONNEMENT

Champs :

- Fournisseur principal
- Stock minimum
- Stock maximum
- Emplacement
- Produit périssable
- Gestion des lots
- Gestion des dates d'expiration
- Vente à crédit autorisée
- Vente unitaire autorisée
- Vente mixte autorisée

Le stock initial doit être enregistré par un mouvement d'inventaire.

---

## 6. LOGIQUE CONDITIONNELLE

Le formulaire doit s'adapter aux choix.

### VERRE

Afficher :

- Volume
- Consigné
- Valeur consigne bouteille
- Réutilisable

### CANETTE

Afficher :

- Volume
- Matériau aluminium
- Conditionnement carton ou pack
- Vente individuelle

### PET

Afficher :

- Volume
- Matériau plastique
- Conditionnement
- Consigne facultative

### CASIER

Afficher :

- Nombre de bouteilles
- Type de casier
- Réutilisable
- Consigné
- Valeur de consigne

### CARTON

Afficher :

- Nombre d'unités
- Coût éventuel
- Consigne désactivée par défaut

Ne jamais supprimer silencieusement une valeur saisie lorsqu'un utilisateur change de type de contenant.

---

## 7. GESTION DES CONSIGNES

La consigne bouteille et la consigne emballage doivent être distinctes.

Créer un système de mouvements permettant :

- Entrée de casiers.
- Sortie de casiers.
- Livraison aux clients.
- Retours clients.
- Retours fournisseurs.
- Casse.
- Perte.
- Ajustement.
- Inventaire.

Chaque mouvement doit conserver :

- Date.
- Quantité.
- Type de mouvement.
- Valeur unitaire.
- Valeur totale.
- Référence de transaction.
- Client ou fournisseur.
- Utilisateur.
- Commentaire.

Ne jamais intégrer automatiquement les consignes dans le chiffre d'affaires ou la marge.

---

## 8. VALIDATIONS

Créer des validations backend et frontend.

Règles :

- Nom produit obligatoire.
- Fabricant obligatoire.
- Marque obligatoire.
- Catégorie obligatoire.
- Volume strictement positif.
- Quantité emballage strictement positive.
- Prix non négatifs.
- SKU unique.
- Code-barres unique lorsqu'il est renseigné.
- Consigne non négative.
- Marque appartenant au fabricant sélectionné.
- Conditionnement lié à une variante existante.
- Unité de vente cohérente avec les conversions.

Les validations backend sont obligatoires.

---

## 9. DESIGN UI/UX

Respecter la direction artistique premium existante de DEPOTPRO.

Créer :

- Formulaire multi-étapes.
- Barre de progression.
- Sections clairement identifiées.
- Validation en temps réel.
- Champs dynamiques.
- Sélecteurs avec recherche.
- Création rapide de référentiels.
- Prévisualisation de la fiche produit.
- Résumé des prix et marges.
- Résumé des consignes.
- Boutons Enregistrer brouillon, Enregistrer et créer une autre référence, Annuler.

Le formulaire doit être utilisable sur écran desktop et tablette.

Prévoir les états :

- Chargement.
- Erreur.
- Validation.
- Sauvalidation.
- Brouillon.
- Succès.
- Modification d'une référence existante.

---

## 10. API BACKEND

Créer ou adapter les endpoints nécessaires :

- CRUD brasseries
- CRUD marques
- CRUD catégories
- CRUD produits
- CRUD variantes
- CRUD conditionnements
- CRUD unités de vente
- CRUD fournisseurs
- CRUD prix
- CRUD règles de consigne
- Gestion mouvements emballages
- Gestion mouvements stock

Respecter l'architecture existante.

Utiliser les transactions SQLite pour les opérations multi-tables.

Les opérations de stock et de consigne doivent être atomiques.

---

## 11. PERFORMANCE ET SÉCURITÉ

- Indexer les clés étrangères.
- Indexer SKU et codes-barres.
- Utiliser des requêtes préparées.
- Éviter les N+1 queries.
- Utiliser les transactions.
- Vérifier les permissions.
- Journaliser les modifications sensibles.
- Ne pas autoriser la suppression des produits ayant des transactions historiques.
- Utiliser un statut actif/inactif.
- Préserver l'intégrité des données.

---

## 12. TESTS

Créer des tests couvrant :

- Création bière verre consignée.
- Création bière canette.
- Création soda PET.
- Création carton non consigné.
- Casier de 12.
- Casier de 24.
- Casier de 20.
- Vente bouteille.
- Vente casier.
- Vente demi-casier.
- Vente mixte.
- Retour casier.
- Retour bouteille.
- Consigne.
- Historique des prix.
- Modification produit.
- Validation SKU dupliqué.
- Conversion d'unités.
- Stock initial.
- Inventaire.
- Migration des données existantes.

---

## 13. LIVRABLES

À la fin :

1. Rapport d'audit.
2. Diagramme ERD.
3. Migrations SQLite.
4. Modèles Rust.
5. Repositories.
6. Services métier.
7. Endpoints Axum.
8. Formulaire React.
9. Composants UI réutilisables.
10. Tests.
11. Documentation.
12. Guide de migration.
13. Liste des fichiers modifiés.
14. Résultats des tests.
15. Liste des problèmes restant à résoudre.

---

## 14. MÉTHODE DE TRAVAIL

Implémenter par étapes.

Étape 1 : Audit.

Étape 2 : Modélisation.

Étape 3 : Migration.

Étape 4 : Backend.

Étape 5 : Formulaire.

Étape 6 : Gestion conditionnements.

Étape 7 : Gestion consignes.

Étape 8 : Intégration stock.

Étape 9 : Tests.

Étape 10 : Validation.

Ne pas effectuer une refonte globale non demandée.

Ne pas supprimer des fonctionnalités existantes.

Ne pas inventer de données commerciales.

Utiliser des catalogues de référence configurables et modifiables par Owner.

Respecter l'architecture actuelle du repository.

La priorité est la fiabilité des données, la cohérence des transactions, la simplicité d'utilisation et la compatibilité avec les opérations réelles des sous-dépôts de boissons en Côte d'Ivoire.

## **12. Ma recommandation finale pour DEPOTPRO**

Le meilleur choix est de construire un **catalogue à trois niveaux** :

**Niveau 1 — Produit**

> BOCK LAGER

**Niveau 2 — Variante physique**

> Bouteille verre 33 cl\
> Canette 33 cl\
> Bouteille verre 50 cl

**Niveau 3 — Conditionnement commercial**

> Bouteille\
> Pack de 6\
> Casier de 24\
> Carton de 24

Et en parallèle :

**Un système indépendant de gestion des emballages consignés**, qui gère les casiers et bouteilles vides avec leur propre stock, leurs mouvements, leurs valeurs de consigne et leurs retours.

Cette structure est beaucoup plus fiable qu'une table produit contenant simplement `nom`, `prix_achat`, `prix_vente`, `quantite` et `consigne`.

Elle permettra à DEPOTPRO de gérer correctement les ventes en détail, les ventes en gros, les produits mixtes, les retours de casiers, les bouteilles consignées, les cartons non consignés, les fournisseurs, les variations de prix et les inventaires.

**Note sur le repository :** j'ai pu confirmer l'existence et les métadonnées du dépôt GitHub, mais les recherches de fichiers effectuées via la connexion n'ont pas retourné le code source exploitable. Le prompt ci-dessus demande donc explicitement à l'agent de réaliser l'audit du code avant toute implémentation, afin de ne pas inventer l'architecture actuelle.

La prochaine étape la plus utile serait de produire le **lot d'implémentation concret de ce module**, avec les migrations SQLite complètes, les modèles Rust, les DTO Axum, les services métier, le formulaire React et les règles de conversion de stock, en l'adaptant aux fichiers réels de ton dépôt.
