-- Migration 0016 : Catalogue de référence SOLIBRA (MAJ.md section 4.3).
--
-- Règles respectées :
-- - Données initiales de référence, PAS des prix d'achat : tous les prix restent à 0
--   et sont configurés par l'owner (le prix public ne doit jamais devenir prix d'achat).
-- - Les références dont le producteur réel n'est pas confirmé sont marquées
--   « À vérifier » via la description (règle 4.3 : ne jamais inventer / attribuer).
-- - Idempotent : INSERT OR IGNORE sur codes uniques.

-- ---------------------------------------------------------------------------
-- 1. Brasserie de référence (une brasserie n'est PAS un fournisseur)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO brands (code, name, description, country_of_origin)
VALUES ('BR-SOLIBRA', 'SOLIBRA', 'Brasseries de Côte d''Ivoire — producteur des marques Beaufort, Bock, Castel, etc.', 'Côte d''Ivoire');

INSERT OR IGNORE INTO product_families (code, name, description)
VALUES ('FAM-BIERES', 'Bières', 'Bières brassées ou distribuées en Côte d''Ivoire'),
       ('FAM-SODAS', 'Boissons gazeuses', 'Sodas et boissons gazeuses'),
       ('FAM-MALT', 'Boissons maltées', 'Malta et boissons maltées non alcoolisées');

-- ---------------------------------------------------------------------------
-- 2. Références du catalogue public SOLIBRA
--    catalogue_products : prix à 0 (configurables par l'owner), deposit_per_unit à 0
--    tant que la valeur de l'emballage n'est pas confirmée par le dépôt.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO catalogue_products (code, name, brand_id, family_id, unit_id, unit_price, deposit_per_unit, is_active, is_sellable)
VALUES
  ('REF-BEA-25-CT24',  'Beaufort 25 cl — carton de 24',              (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0),
  ('REF-BEA-33-CAS24', 'Beaufort 33 cl — casier de 24 bouteilles',   (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BEA-50-CAS12', 'Beaufort 50 cl — casier de 12 bouteilles',   (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BEA-CAN33-CT24','Beaufort canette 33 cl — carton de 24',     (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0),
  ('REF-BOCK-33-CAS24','Bock 33 cl — casier de 24 bouteilles',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BOCK-50-CAS12','Bock 50 cl — casier de 12 bouteilles',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BOCK-65-CAS12','Bock 65 cl — casier de 12 bouteilles',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BOCK-100-CAS12','Bock 100 cl — casier de 12 bouteilles',     (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-BOCK-CAN33-CT24','Bock canette 33 cl — carton de 24',        (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0),
  ('REF-BOCK-CAN50-CT24','Bock canette 50 cl — carton de 24',        (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0),
  ('REF-CASTEL-33-CAS24','Castel 33 cl — casier de 24 bouteilles',   (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-CASTEL-50-CAS12','Castel 50 cl — casier de 12 bouteilles',   (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-DOPPEL-33-CAS24','Doppel Munich 33 cl — casier de 24',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-DOPPEL-50-CAS12','Doppel Munich 50 cl — casier de 12',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-GUIN-33-CAS24', 'Guinness 33 cl — casier de 24',             (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-GUIN-65-CAS12', 'Guinness 65 cl — casier de 12',             (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-MALTA-30-CAS24','Malta Guinness 30 cl — casier de 24',       (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-MALT'),   (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-VALP-50-CAS12', 'Valpierre 50 cl — casier de 12',            (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-VALP-100-CAS12','Valpierre 100 cl — casier de 12',           (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='crate'),  0, 0, 1, 0),
  ('REF-ORANG-CAN33-CT24','Orangina canette 33 cl — carton de 24',   (SELECT id FROM brands WHERE code='BR-SOLIBRA'), (SELECT id FROM product_families WHERE code='FAM-SODAS'),  (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0);

-- Marques/dont le rattachement SOLIBRA n'est pas confirmé : créées comme marques
-- indépendantes pour préparer leurs variantes, sans attribution arbitraire.
INSERT OR IGNORE INTO brands (code, name, description, country_of_origin) VALUES
  ('BR-RACINES',    'Racines',        'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-RACINES-FORT','Racines Fort',  'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-CHILL',      'Chill',          'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-SOMBREROS',  'Sombreros',      'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-CORONA',     'Corona Extra',   'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-YOUKI',      'Youki',          'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-YOUZOU',     'Youzou',         'Marque à vérifier — rattachement producteur à confirmer', NULL),
  ('BR-BUDWEISER',  'Budweiser',      'Marque à vérifier — conditionnement public à vérifier', NULL),
  ('BR-WORLD-COLA', 'World Cola',     'Marque à vérifier — rattachement producteur à confirmer', NULL);

INSERT OR IGNORE INTO catalogue_products (code, name, brand_id, family_id, unit_id, unit_price, deposit_per_unit, is_active, is_sellable)
VALUES
  ('REF-BUD-33-?',      'Budweiser 33 cl — conditionnement à vérifier', (SELECT id FROM brands WHERE code='BR-BUDWEISER'), (SELECT id FROM product_families WHERE code='FAM-BIERES'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0),
  ('REF-WCOLA-150-PK6', 'World Cola 1,5 l — pack de 6',                 (SELECT id FROM brands WHERE code='BR-WORLD-COLA'), (SELECT id FROM product_families WHERE code='FAM-SODAS'), (SELECT id FROM units_of_measure WHERE code='piece'),  0, 0, 1, 0);
