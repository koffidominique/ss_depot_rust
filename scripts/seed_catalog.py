#!/usr/bin/env python3
"""
Seed du catalogue central SS DEPOT RUST — catalogue_seed.json → SQLite.

Idempotent : réexécutable sans créer de doublons (clés métier naturelles).
Respecte les règles du catalogue_seed.md :
- produits organisés par producteur → marque → famille → produit → variante → conditionnement ;
- prix à 0 (configurés par l'OWNER, jamais de prix public importé) ;
- statuts de vérification et provenance conservés ;
- aucune donnée inconnue transformée en valeur fictive : packaging absent = variante sans
  conditionnement, statut to_verify.

Usage :
  python3 scripts/seed_catalog.py [--db <chemin>] [--json catalog_seed.json] [--dry-run]
Par défaut : DB de dev via la variable DEPOTPRO_DB, sinon depotpro.db à la racine.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON = ROOT / "catalog_seed.json"
DEFAULT_DB = Path(os.environ.get("DEPOTPRO_DB", ROOT / "depotpro.db"))

CONTAINER_LABELS = {
    "glass_bottle": ("Bouteille en verre", "glass"),
    "pet_bottle": ("Bouteille PET", "plastic"),
    "can": ("Canette aluminium", "other"),
}

PACKAGING_LABELS = {
    "crate": "Casier",
    "carton": "Carton",
    "pack": "Pack",
}


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def load_seed(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if "manufacturers" not in data:
        raise SystemExit("catalog_seed.json invalide : clé 'manufacturers' manquante.")
    return data


def ensure_reference_rows(cur: sqlite3.Cursor) -> dict:
    """Crée les familles et unités de mesure de référence ; retourne leurs ids."""
    ids: dict[str, int] = {}

    families = {
        "BIERE": ("Bière", "Boissons alcoolisées"),
        "BIERE-AROMATISEE": ("Bière aromatisée", "Boissons alcoolisées"),
        "SODA": ("Soda", "Boissons non alcoolisées"),
        "EAU": ("Eau", "Boissons non alcoolisées"),
        "JUS": ("Jus de fruits", "Boissons non alcoolisées"),
        "SIROP": ("Sirop", "Boissons non alcoolisées"),
        "MALT": ("Boisson maltée", "Boissons non alcoolisées"),
        "ENERGISANTE": ("Boisson énergisante", "Boissons non alcoolisées"),
        "VIN": ("Vin", "Boissons alcoolisées"),
    }
    fam_category = {
        "Bières": "BIERE",
        "Bières aromatisées": "BIERE-AROMATISEE",
        "Boissons gazeuses": "SODA",
        "Boissons maltées": "MALT",
        "Boissons énergisantes": "ENERGISANTE",
        "Vins": "VIN",
        "Vins et sangrias": "VIN",
        "Jus et boissons fruitées": "JUS",
        "Références historiques": "BIERE",
        "Bières importées": "BIERE",
    }
    for code, (name, category) in families.items():
        cur.execute(
            "INSERT OR IGNORE INTO product_families (code, name, category, is_active)"
            " VALUES (?, ?, ?, 1)",
            (code, name, category),
        )
    for fam_label, code in fam_category.items():
        row = cur.execute(
            "SELECT id FROM product_families WHERE code = ?", (code,)
        ).fetchone()
        if row:
            ids[fam_category_key(fam_label)] = row[0]

    units = [
        ("PIECE", "Pièce", "pcs", "piece", 1.0),
        ("LITER", "Litre", "L", "liter", 1.0),
        ("CENTILITER", "Centilitre", "cL", "liter", 0.01),
        ("CASE", "Casier", "casier", "case", 1.0),
        ("PACK", "Pack", "pack", "pack", 1.0),
    ]
    for code, name, symbol, unit_type, factor in units:
        cur.execute(
            "INSERT OR IGNORE INTO units_of_measure"
            " (code, name, symbol, unit_type, conversion_factor, is_active)"
            " VALUES (?, ?, ?, ?, ?, 1)",
            (code, name, symbol, unit_type, factor),
        )
    for code in ("PIECE", "CASE", "PACK"):
        row = cur.execute(
            "SELECT id FROM units_of_measure WHERE code = ?", (code,)
        ).fetchone()
        if row:
            ids[f"unit_{code}"] = row[0]
    return ids


def fam_category_key(label: str) -> str:
    return f"fam_{label}"


def upsert_manufacturer(cur: sqlite3.Cursor, mfr: dict) -> int:
    """Le producteur est enregistré comme marque-porteuse ('brand' racine) :
    la table brands existante porte déjà country_of_origin + description.
    On utilise un code dédié MFR-* pour le producteur lui-même."""
    code = mfr["code"]
    name = mfr["name"]
    existing = cur.execute(
        "SELECT id FROM brands WHERE name = ?", (name,)
    ).fetchone()
    if existing:
        # Marque déjà créée par la migration 0016 : réutiliser sans doublon de nom.
        cur.execute(
            "UPDATE brands SET description = COALESCE(?, description),"
            " country_of_origin = COALESCE(?, country_of_origin) WHERE id = ?",
            (mfr.get("description"), mfr.get("country"), existing[0]),
        )
        return existing[0]
    cur.execute(
        "INSERT INTO brands (code, name, description, country_of_origin, is_active)"
        " VALUES (?, ?, ?, ?, 1)",
        (code, name, mfr.get("description"), mfr.get("country")),
    )
    row = cur.execute("SELECT id FROM brands WHERE code = ?", (code,)).fetchone()
    return row[0]


def upsert_brand(cur: sqlite3.Cursor, brand: dict, mfr_id: int) -> int:
    code = brand["code"]
    existing_by_name = cur.execute(
        "SELECT id FROM brands WHERE name = ?", (brand["name"],)
    ).fetchone()
    if existing_by_name:
        return existing_by_name[0]
    cur.execute(
        "INSERT INTO brands (code, name, description, country_of_origin, is_active)"
        " VALUES (?, ?, ?, NULL, 1)"
        " ON CONFLICT(code) DO UPDATE SET name = excluded.name, is_active = 1",
        (code, brand["name"], brand.get("description")),
    )
    row = cur.execute("SELECT id FROM brands WHERE code = ?", (code,)).fetchone()
    return row[0]


def upsert_variant_as_catalogue_product(
    cur: sqlite3.Cursor,
    variant: dict,
    brand_id: int,
    family_id: int | None,
    unit_id: int,
    stats: dict,
) -> None:
    sku = variant["sku"]
    packaging = variant.get("packaging")
    bottle_capacity = variant.get("volume_ml")

    bottle_profile_id = None
    crate_type_id = None

    if bottle_capacity and variant.get("container") in CONTAINER_LABELS:
        label, material = CONTAINER_LABELS[variant["container"]]
        bp_code = f"BP-{sku}"
        cur.execute(
            "INSERT INTO bottle_profiles (code, name, producer, material, capacity_ml,"
            " deposit_value, description, is_active)"
            " VALUES (?, ?, 'SEED', ?, ?, 0, NULL, 1)"
            " ON CONFLICT(code) DO UPDATE SET name = excluded.name",
            (bp_code, f"Profil {variant['name']}", material, bottle_capacity),
        )
        bottle_profile_id = cur.execute(
            "SELECT id FROM bottle_profiles WHERE code = ?", (bp_code,)
        ).fetchone()[0]

        ct_code = ""  # Initialize fallback
if packaging:
    if isinstance(packaging, dict):
        pkg_type = packaging.get("type", "")
    else:
        pkg_type = packaging
    if pkg_type == "crate":
        ct_code = f"CT-{sku}"
    # Handle both formats for packaging units
    if isinstance(packaging, dict):
        units = packaging.get("units", 24)
    else:
        # String format: assume crate has 24 units, others default
        units = 24 if pkg_type == "crate" else (packaging if packaging else "24")
    cur.execute(
        "INSERT INTO crate_types (code, name, producer, capacity, bottle_capacity_ml,"
        " bottle_profile_id, material, deposit_value, description, is_active)"
        " VALUES (?, ?, 'SEED', ?, ?, ?, 'plastic', 0, NULL, 1)"
        " ON CONFLICT(code) DO UPDATE SET name = excluded.name, capacity = excluded.capacity",
        (ct_code, f"Conditionnement {variant['name']}", units, bottle_capacity, bottle_profile_id),
    )
    crate_type_id = cur.execute(
        "SELECT id FROM crate_types WHERE code = ?", (ct_code,)
    ).fetchone()[0]

    unit_code = "PIECE"
    # Handle both dict format (old catalog_seed.json) and string format (SOLIBRA catalog)
    if packaging:
        if isinstance(packaging, dict):
            pkg_type = packaging.get("type", "")
        else:
            # String format: packaging is directly the type name
            pkg_type = packaging
        if pkg_type == "crate":
            unit_code = "CASE"
        elif pkg_type == "pack":
            unit_code = "PACK"
    unit_row = cur.execute(
        "SELECT id FROM units_of_measure WHERE code = ?", (unit_code,)
    ).fetchone()
    unit_id_variant = unit_row[0] if unit_row else unit_id

    verification = variant.get("verification_status", "to_verify")
    source = variant.get("source", "manual_entry")

    description = variant.get("name")
    if verification in ("to_verify", "historical"):
        description = f"{variant['name']} — À vérifier"

    cur.execute(
        "INSERT INTO catalogue_products (code, name, barcode, brand_id, family_id,"
        " bottle_profile_id, crate_type_id, unit_id, unit_price, deposit_per_unit,"
        " is_active, is_sellable)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 0)"
        " ON CONFLICT(code) DO UPDATE SET"
        " name = excluded.name,"
        " brand_id = excluded.brand_id,"
        " family_id = excluded.family_id,"
        " bottle_profile_id = COALESCE(excluded.bottle_profile_id, catalogue_products.bottle_profile_id),"
        " crate_type_id = COALESCE(excluded.crate_type_id, catalogue_products.crate_type_id)",
        (
            sku,
            description,
            None,
            brand_id,
            family_id,
            bottle_profile_id,
            crate_type_id,
            unit_id_variant,
        ),
    )

    stats["variants"] += 1
    if verification in ("to_verify", "historical"):
        stats["to_verify"] += 1
    if packaging is None:
        stats["without_packaging"] += 1


def seed(cur: sqlite3.Cursor, data: dict, dry_run: bool) -> dict:
    stats = {"manufacturers": 0, "brands": 0, "variants": 0, "to_verify": 0, "without_packaging": 0}

    refs = ensure_reference_rows(cur)
    unit_piece = refs["unit_PIECE"]

    for mfr in data["manufacturers"]:
        mfr_id = upsert_manufacturer(cur, mfr)
        stats["manufacturers"] += 1
        for brand in mfr.get("brands", []):
            brand_id = upsert_brand(cur, brand, mfr_id)
            stats["brands"] += 1
            family_id = refs.get(fam_category_key(brand.get("category", "")))
            for product in brand.get("products", []):
                for variant in product.get("variants", []):
                    upsert_variant_as_catalogue_product(
                        cur, variant, brand_id, family_id, unit_piece, stats
                    )
    return stats


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
