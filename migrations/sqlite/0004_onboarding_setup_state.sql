-- Migration 0004 : Suivi explicite de l'assistant de première configuration
ALTER TABLE app_settings ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 0 CHECK (setup_completed IN (0, 1));
