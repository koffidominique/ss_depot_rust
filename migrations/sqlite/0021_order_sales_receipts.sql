-- Link a finalized customer order to the existing sales/receipt ledger.
-- Stock is not duplicated here: it was already deducted during authorized order confirmation.
ALTER TABLE sales ADD COLUMN order_id INTEGER NULL REFERENCES orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_id ON sales(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE payments ADD COLUMN order_id INTEGER NULL REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
