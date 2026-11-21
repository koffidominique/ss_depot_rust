-- Migration 0013 : alignement pending_partial_returns sur partial_returns.rs
-- Le service crates/depotpro-core/src/application/partial_returns.rs utilise un suivi
-- quantitatif (pieces) plutôt que les blobs JSON de 0008.

ALTER TABLE pending_partial_returns ADD COLUMN total_expected_pieces INTEGER NOT NULL DEFAULT 0 CHECK (total_expected_pieces >= 0);
ALTER TABLE pending_partial_returns ADD COLUMN total_returned_pieces INTEGER NOT NULL DEFAULT 0 CHECK (total_returned_pieces >= 0);
ALTER TABLE pending_partial_returns ADD COLUMN remaining_pieces INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pending_partial_returns ADD COLUMN last_updated_at TEXT NULL;

-- Réinterprétation du blob JSON existant (s'il contient des données) : total_expected_deposit
-- et total_refunded_amount restent inchangés. Les colonnes JSON attendus/reçus deviennent
-- obsolètes mais sont conservées pour l'historique (aucune donnée effacée).

CREATE INDEX IF NOT EXISTS idx_pending_returns_status_pending ON pending_partial_returns(status, remaining_pieces);
