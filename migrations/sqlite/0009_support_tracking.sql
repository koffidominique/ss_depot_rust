-- Migration 0009 : Support tracking for crates (suivi des supports pour les casiers)
-- Ajout du champ support_quantity_milli pour suivre séparément les supports plastiques
-- par rapport aux bouteilles dans les lignes de vente

PRAGMA foreign_keys = ON;

-- Ajout du champ support_quantity_milli aux sale_lines
-- Ce champ représente le nombre de supports plastiques (en milli-unités)
ALTER TABLE sale_lines ADD COLUMN support_quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK (support_quantity_milli >= 0);

-- Index pour des performances optimisées sur les recherches par support
CREATE INDEX IF NOT EXISTS idx_sale_lines_support ON sale_lines(support_quantity_milli);

-- Commentaire documenting the new field
-- Ce champ permet de distinguer les supports plastiques des bouteilles
-- conformément à l'architecture DEPOTPRO V3 où un casier = support + bouteilles