-- Migration 0002 : Ajout du logo personnalisé du dépôt sur app_settings
ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL;
