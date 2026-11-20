-- Migration 0015 : Obligations d'emballages, politiques de restitution,
-- conversions en créances financières et journal financier d'emballages.
--
-- Règles métier (MAJ.md) :
-- 1. Une obligation physique de restitution n'est PAS une dette financière exigible.
-- 2. La valeur unitaire de l'emballage est photographiée au moment de la vente
--    (déjà le cas via deposit_issues.unit_value) et ne change jamais rétroactivement.
-- 3. À l'échéance, ou sur perte/destruction validée, la quantité non restituée est
--    convertie en créance financière d'emballages, une seule fois (idempotent).
-- 4. Les conversions sont tracées dans packaging_conversions et le journal
--    customer_packaging_financial_ledger, jamais fusionnées avec le compte commercial.

-- ---------------------------------------------------------------------------
-- 1. Politique de restitution configurable
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packaging_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    -- Périmètre (NULL = valeur par défaut globale)
    returnable_id INTEGER NULL REFERENCES returnable_packaging_types(id),
    client_id INTEGER NULL REFERENCES clients(id),
    -- Délai de restitution en jours
    return_delay_days INTEGER NOT NULL DEFAULT 30 CHECK (return_delay_days >= 0),
    -- Conversion automatique à l'échéance (1) ou validation manuelle (0)
    auto_convert_on_due INTEGER NOT NULL DEFAULT 1 CHECK (auto_convert_on_due IN (0, 1)),
    -- Accepter un retour après échéance / après conversion
    allow_late_return INTEGER NOT NULL DEFAULT 1 CHECK (allow_late_return IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La politique la plus spécifique gagne : client > emballage > défaut global.
CREATE INDEX IF NOT EXISTS idx_packaging_policies_returnable ON packaging_policies(returnable_id);
CREATE INDEX IF NOT EXISTS idx_packaging_policies_client ON packaging_policies(client_id);

-- ---------------------------------------------------------------------------
-- 2. Étendre deposit_issues : chaque ligne devient une obligation d'emballages
--    avec échéance, quantités converties et statut.
--    (Quantités historiques déjà soldées sont initialisées à 0.)
-- ---------------------------------------------------------------------------
ALTER TABLE deposit_issues ADD COLUMN lost_pieces INTEGER NOT NULL DEFAULT 0
    CHECK (lost_pieces >= 0 AND lost_pieces <= pieces);
ALTER TABLE deposit_issues ADD COLUMN destroyed_pieces INTEGER NOT NULL DEFAULT 0
    CHECK (destroyed_pieces >= 0 AND destroyed_pieces <= pieces);
ALTER TABLE deposit_issues ADD COLUMN converted_pieces INTEGER NOT NULL DEFAULT 0
    CHECK (converted_pieces >= 0 AND converted_pieces <= pieces);
ALTER TABLE deposit_issues ADD COLUMN due_date TEXT NULL;
ALTER TABLE deposit_issues ADD COLUMN policy_id INTEGER NULL REFERENCES packaging_policies(id);
ALTER TABLE deposit_issues ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partially_returned', 'settled', 'converted', 'cancelled'));
ALTER TABLE deposit_issues ADD COLUMN converted_at TEXT NULL;
ALTER TABLE deposit_issues ADD COLUMN updated_at TEXT NULL;

-- Recalcul du statut des obligations existantes :
-- soldées si retournées, sinon en attente (pas de conversion rétroactive :
-- les obligations antérieures à cette migration ne deviennent pas des dettes).
UPDATE deposit_issues
SET status = CASE
    WHEN returned_pieces >= pieces THEN 'settled'
    WHEN returned_pieces > 0 THEN 'partially_returned'
    ELSE 'pending'
END;

CREATE INDEX IF NOT EXISTS idx_deposit_issues_client_due ON deposit_issues(client_id, due_date);
CREATE INDEX IF NOT EXISTS idx_deposit_issues_status ON deposit_issues(status);

-- ---------------------------------------------------------------------------
-- 3. Conversions en créance financière (idempotence garantie par
--    converted_pieces + une ligne ici par opération de conversion)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packaging_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    deposit_issue_id INTEGER NOT NULL REFERENCES deposit_issues(id),
    client_id INTEGER NULL REFERENCES clients(id),
    -- Motif : due_date (échéance), loss, destruction, damaged, other
    reason TEXT NOT NULL CHECK (reason IN ('due_date', 'loss', 'destruction', 'damaged', 'other')),
    pieces INTEGER NOT NULL CHECK (pieces > 0),
    unit_value_snapshot INTEGER NOT NULL CHECK (unit_value_snapshot >= 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    -- Traçabilité
    source_sale_id INTEGER NULL REFERENCES sales(id),
    validated_by_user_id INTEGER NULL REFERENCES users(id),
    reversal_of_conversion_id INTEGER NULL REFERENCES packaging_conversions(id),
    reversed INTEGER NOT NULL DEFAULT 0 CHECK (reversed IN (0, 1)),
    note TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_packaging_conversions_issue ON packaging_conversions(deposit_issue_id);
CREATE INDEX IF NOT EXISTS idx_packaging_conversions_client ON packaging_conversions(client_id);

-- ---------------------------------------------------------------------------
-- 4. Journal financier des créances d'emballages (registre distinct du
--    compte commercial customer_receivables)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_packaging_financial_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    conversion_id INTEGER NULL REFERENCES packaging_conversions(id),
    -- entry_type :
    --   conversion_charge : dette créée (débit client)
    --   late_return_credit : régularisation après retour tardif (crédit client)
    --   payment : règlement affecté à la créance d'emballages
    --   adjustment : correction autorisée
    entry_type TEXT NOT NULL CHECK (entry_type IN
        ('conversion_charge', 'late_return_credit', 'payment', 'adjustment')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    -- direction : 'debit' augmente le solde dû, 'credit' le diminue
    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    related_sale_id INTEGER NULL REFERENCES sales(id),
    related_return_id INTEGER NULL REFERENCES deposit_returns(id),
    note TEXT NULL,
    created_by_user_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pkg_fin_ledger_client ON customer_packaging_financial_ledger(client_id);

-- ---------------------------------------------------------------------------
-- 5. Historique des valeurs d'emballages (photographie par période)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packaging_valuations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    unit_value INTEGER NOT NULL CHECK (unit_value >= 0),
    effective_from TEXT NOT NULL,
    effective_to TEXT NULL,
    created_by_user_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_packaging_valuations_returnable ON packaging_valuations(returnable_id, effective_from);

-- ---------------------------------------------------------------------------
-- 6. Déclaration de perte / destruction avant échéance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packaging_loss_declarations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    deposit_issue_id INTEGER NOT NULL REFERENCES deposit_issues(id),
    client_id INTEGER NULL REFERENCES clients(id),
    pieces INTEGER NOT NULL CHECK (pieces > 0),
    -- declared : déclaration saisie / validated : validée par un responsable
    status TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared', 'validated', 'rejected')),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    declared_by_user_id INTEGER NULL REFERENCES users(id),
    validated_by_user_id INTEGER NULL REFERENCES users(id),
    conversion_id INTEGER NULL REFERENCES packaging_conversions(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_pkg_loss_declarations_issue ON packaging_loss_declarations(deposit_issue_id);

-- ---------------------------------------------------------------------------
-- 7. Politique par défaut globale (délai 30 jours, conversion automatique)
-- ---------------------------------------------------------------------------
INSERT INTO packaging_policies (name, return_delay_days, auto_convert_on_due, allow_late_return)
SELECT 'Politique par défaut', 30, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM packaging_policies WHERE returnable_id IS NULL AND client_id IS NULL);

-- Initialiser les échéances des obligations en attente existantes à +30 jours
-- (politique par défaut), pour qu'elles soient gérables par le module d'échéances.
UPDATE deposit_issues
SET due_date = date(created_at, '+30 days'),
    policy_id = (SELECT id FROM packaging_policies WHERE returnable_id IS NULL AND client_id IS NULL LIMIT 1)
WHERE due_date IS NULL AND status IN ('pending', 'partially_returned');

-- Journal des changements du référentiel emballages
CREATE TABLE IF NOT EXISTS packaging_policy_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NULL,
    details TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
