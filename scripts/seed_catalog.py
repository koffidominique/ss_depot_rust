#!/usr/bin/env python3
"""
Seed du catalogue central SS DEPOT RUST — catalogue_seed.json → SQLite.

Idempotent : réexécutable sans créer de doublons (clés métier naturelles).
Usage :
  python3 scripts/seed_catalog.py [--db <chemin>] [--json catalog_seed.json] [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

try:
    from catalog_seed_lib import load_seed, seed
except ImportError:
    from scripts.catalog_seed_lib import load_seed, seed  # type: ignore

# ---------------------------------------------------------------------------
# Configuration par défaut & point d'entrée CLI
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON = ROOT / "catalog_seed.json"
DEFAULT_DB = Path(os.environ.get("DEPOTPRO_DB", ROOT / "depotpro.db"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed catalogue central SS DEPOT RUST")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Chemin de la base SQLite")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON, help="Fichier seed JSON")
    parser.add_argument("--dry-run", action="store_true", help="Lit et valide sans écrire")
    args = parser.parse_args()

    if not args.json.exists():
        raise SystemExit(f"Fichier seed introuvable : {args.json}")

    data = load_seed(args.json)
    n_mfr = len(data["manufacturers"])
    n_brands = sum(len(m.get("brands", [])) for m in data["manufacturers"])
    n_variants = sum(
        len(p.get("variants", []))
        for m in data["manufacturers"]
        for b in m.get("brands", [])
        for p in b.get("products", [])
    )
    print(f"Seed chargé : {n_mfr} producteurs, {n_brands} marques, {n_variants} variantes.")

    if args.dry_run:
        print("Dry-run : aucune écriture.")
        return 0

    if not args.db.exists():
        raise SystemExit(
            f"Base introuvable : {args.db}. Lancez d'abord l'application (migrations 0001+),"
            " puis relancez le seed."
        )

    con = sqlite3.connect(args.db)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        cur = con.cursor()
        stats = seed(cur, data, dry_run=False)
        con.commit()
        print(
            "Seed appliqué : {manufacturers} producteurs, {brands} marques, "
            "{variants} variantes ({to_verify} à vérifier, {without_packaging} sans conditionnement confirmé).".format(
                **stats
            )
        )
    except sqlite3.Error as exc:
        con.rollback()
        print(f"Erreur SQLite, transaction annulée : {exc}", file=sys.stderr)
        return 1
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
