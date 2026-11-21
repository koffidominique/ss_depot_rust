#!/usr/bin/env python3
"""
DEPOTPRO V2 (Python/SQLAlchemy) -> V3 (SQLite exact integer FCFA & milli_units)
Migration non destructive sur copie avec détection d'anomalies sans arrondi silencieux.
"""
import argparse
import json
import shutil
import sqlite3
from pathlib import Path

try:
    from migration_v2_helpers import (
        apply_v3_schema_and_migrations,
        migrate_categories_suppliers_clients,
        migrate_products_and_packagings,
        migrate_settings_and_security,
        table_exists,
    )
except ImportError:
    from scripts.migration_v2_helpers import (  # type: ignore
        apply_v3_schema_and_migrations,
        migrate_categories_suppliers_clients,
        migrate_products_and_packagings,
        migrate_settings_and_security,
        table_exists,
    )


# ---------------------------------------------------------------------------
# Orchestrateur principal de migration V2 -> V3
# ---------------------------------------------------------------------------


def migrate(source_path: Path, target_path: Path, schema_sql_path: Path, strict: bool) -> dict:
    if not source_path.exists():
        raise FileNotFoundError(f"Base source introuvable: {source_path}")
    if target_path.exists():
        target_path.unlink()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    backup_copy = target_path.with_suffix(".source_snapshot.db")
    shutil.copy2(source_path, backup_copy)

    src = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(str(target_path))
    dst.execute("PRAGMA foreign_keys = ON;")

    apply_v3_schema_and_migrations(dst, schema_sql_path)

    anomalies: list = []
    report = {
        "source": str(source_path),
        "target": str(target_path),
        "source_snapshot": str(backup_copy),
        "legacy_schema_versions": [],
        "counts": {},
        "anomalies": anomalies,
    }

    if table_exists(src, "depotpro_schema_migrations"):
        report["legacy_schema_versions"] = [
            r["version"]
            for r in src.execute("SELECT version FROM depotpro_schema_migrations ORDER BY version").fetchall()
        ]

    # Migration des données métier par domaine
    migrate_settings_and_security(src, dst)
    party_counts = migrate_categories_suppliers_clients(src, dst)
    product_counts = migrate_products_and_packagings(src, dst, anomalies)
    report["counts"].update(party_counts)
    report["counts"].update(product_counts)

    dst.execute("INSERT OR REPLACE INTO schema_version (version, name) VALUES (1, '0001_initial_v3_migrated')")
    dst.commit()

    # Contrôles finaux d'intégrité et de clés étrangères
    integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
    fk_errors = dst.execute("PRAGMA foreign_key_check").fetchall()
    report["integrity_check"] = integrity
    report["foreign_key_errors"] = len(fk_errors)

    src.close()
    dst.close()

    if strict and (anomalies or integrity != "ok" or len(fk_errors) > 0):
        raise SystemExit(
            f"Migration rejetée en mode strict: {json.dumps(report, ensure_ascii=False, indent=2)}"
        )

    return report


# ---------------------------------------------------------------------------
# Point d'entrée CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Migration sécurisée DEPOTPRO V2 -> V3")
    parser.add_argument("--source", required=True, help="Chemin base SQLite V2 existante (lue en lecture seule)")
    parser.add_argument("--target", required=True, help="Chemin base SQLite V3 cible")
    parser.add_argument(
        "--schema",
        default=str(Path(__file__).resolve().parent.parent / "migrations" / "sqlite" / "0001_initial_v3.sql"),
        help="Chemin du schéma SQL V3",
    )
    parser.add_argument("--strict", action="store_true", help="Échoue si la moindre anomalie de précision existe")
    args = parser.parse_args()

    res = migrate(Path(args.source), Path(args.target), Path(args.schema), args.strict)
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
