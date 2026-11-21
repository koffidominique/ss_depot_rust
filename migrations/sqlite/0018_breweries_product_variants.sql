-- Migration 0018 : producteurs / brasseries, marques liées et fiche boisson structurée.
-- Les anciennes colonnes products.brand et products.base_unit restent compatibles.
-- Les variantes physiques sont stockées dans product_variants, déjà reliées à products.

CREATE TABLE IF NOT EXISTS breweries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    country_code TEXT NOT NULL DEFAULT 'CI' CHECK (length(country_code) = 2),
    address TEXT NULL,
    website TEXT NULL,
    notes TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE brands ADD COLUMN brewery_id INTEGER NULL
    REFERENCES breweries(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_breweries_name_active ON breweries(name, is_active);
CREATE INDEX IF NOT EXISTS idx_brands_brewery ON brands(brewery_id, is_active);

-- Producteurs confirmés par leurs sites institutionnels.
INSERT OR IGNORE INTO breweries (code, name, country_code, website, notes)
VALUES
    ('SOLIBRA-CI', 'SOLIBRA', 'CI', 'https://www.solibra.ci',
     'Producteur et distributeur de boissons en Côte d’Ivoire. Les marques sont liées au producteur, pas au fournisseur du sous-dépôt.'),
    ('BRASSIVOIRE-CI', 'BRASSIVOIRE', 'CI', 'https://brassivoire.ci',
     'Brasserie installée au PK24 / Anyama, Côte d’Ivoire.');

-- Marques du portefeuille SOLIBRA (noms du site institutionnel).
-- L'insertion vérifie aussi le nom sans tenir compte de la casse, car les
-- premières migrations contiennent des marques historiques en minuscules.
INSERT OR IGNORE INTO brands (code, name, description, brewery_id, is_active)
SELECT seed.code, seed.name, seed.description, br.id, 1
FROM (
    SELECT 'BR-BOCK' AS code, 'Bock' AS name, 'Marque du portefeuille SOLIBRA' AS description UNION ALL
    SELECT 'BR-BEAUFORT', 'Beaufort Lager', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-CASTEL-BEER', 'Castel Beer', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-SOMBREROS', 'Sombreros', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-CHILL', 'Chill', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-DOPPEL-MUNICH', 'Doppel Munich', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-GUINNESS', 'Guinness', 'Marque distribuée et embouteillée sous licence par SOLIBRA' UNION ALL
    SELECT 'BR-BUDWEISER', 'Budweiser', 'Marque importée et distribuée par SOLIBRA' UNION ALL
    SELECT 'BR-CORONA-EXTRA', 'Corona Extra', 'Marque importée et distribuée par SOLIBRA' UNION ALL
    SELECT 'BR-YOUKI', 'Youki', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-WORLD-COLA', 'World Cola', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-YOUZOU', 'Youzou', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-ORANGINA', 'Orangina', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-VALPIERRE', 'Valpierre', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-RACINES', 'Racines', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-RACINES-FORT', 'Racines Fort', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-FEROX-ENERGY', 'Ferox Energy', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-DOPPEL-ENERGY-MALT', 'Doppel Energy Malt', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-XXL', 'XXL', 'Marque du portefeuille SOLIBRA' UNION ALL
    SELECT 'BR-MALTA-GUINNESS', 'Malta Guinness', 'Marque du portefeuille SOLIBRA'
) AS seed
JOIN breweries br ON br.code = 'SOLIBRA-CI'
WHERE NOT EXISTS (
    SELECT 1 FROM brands existing
    WHERE lower(trim(existing.name)) = lower(trim(seed.name))
);

-- Rattacher les marques historiques présentes dans les premières migrations.
UPDATE brands
SET brewery_id = (SELECT id FROM breweries WHERE code = 'SOLIBRA-CI'),
    updated_at = datetime('now')
WHERE lower(trim(name)) IN (
    'bock', 'beaufort lager', 'beaufort', 'castel beer', 'sombreros', 'chill',
    'doppel munich', 'guinness', 'budweiser', 'corona', 'corona extra',
    'youki', 'world cola', 'youzou', 'orangina', 'valpierre', 'racines',
    'racines fort', 'ferox energy', 'doppel energy malt', 'xxl', 'malta guinness'
);

-- Portefeuille BRASSIVOIRE tel que présenté sur son site institutionnel.
INSERT OR IGNORE INTO brands (code, name, description, brewery_id, is_active)
SELECT seed.code, seed.name, seed.description, br.id, 1
FROM (
    SELECT 'BR-IVOIRE-CLASSIC' AS code, 'Ivoire Classic' AS name,
           'Marque du portefeuille BRASSIVOIRE' AS description UNION ALL
    SELECT 'BR-IVOIRE-BLACK', 'Ivoire Black', 'Marque du portefeuille BRASSIVOIRE' UNION ALL
    SELECT 'BR-HEINEKEN', 'Heineken', 'Marque du portefeuille BRASSIVOIRE' UNION ALL
    SELECT 'BR-DESPERADOS', 'Desperados', 'Marque du portefeuille BRASSIVOIRE' UNION ALL
    SELECT 'BR-RHINO-ENERGY-MALT', 'Rhino Energy Malt', 'Boisson maltée sans alcool du portefeuille BRASSIVOIRE'
) AS seed
JOIN breweries br ON br.code = 'BRASSIVOIRE-CI'
WHERE NOT EXISTS (
    SELECT 1 FROM brands existing
    WHERE lower(trim(existing.name)) = lower(trim(seed.name))
);

UPDATE brands
SET brewery_id = (SELECT id FROM breweries WHERE code = 'BRASSIVOIRE-CI'),
    updated_at = datetime('now')
WHERE lower(trim(name)) IN (
    'ivoire', 'ivoire classic', 'ivoire black', 'black', 'heineken',
    'desperados', 'rhino energy malt'
);

-- Rattacher les produits opérationnels dont la marque texte correspond
-- exactement à une marque connue. Aucune attribution sur simple ressemblance.
UPDATE products
SET brand_id = (
    SELECT b.id FROM brands b
    WHERE lower(trim(b.name)) = lower(trim(products.brand))
      AND b.brewery_id IS NOT NULL
    LIMIT 1
)
WHERE brand_id IS NULL
  AND brand IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM brands b
    WHERE lower(trim(b.name)) = lower(trim(products.brand))
      AND b.brewery_id IS NOT NULL
  );
