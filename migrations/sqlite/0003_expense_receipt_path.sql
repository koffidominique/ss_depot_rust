-- Migration 0003 : Ajout du justificatif local sur expenses
ALTER TABLE expenses ADD COLUMN receipt_path TEXT NULL;
