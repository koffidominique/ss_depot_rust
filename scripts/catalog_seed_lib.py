"""
Fonctions utilitaires de seeding du catalogue central SS DEPOT RUST.

Sections :
1. Constantes de référence (contenants, conditionnements)
2. Initialisation des tables de référence (familles, unités)
3. Upsert producteurs, marques et variantes catalogue
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Constantes de référence
# ---------------------------------------------------------------------------

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


def fam_category_key(label: str) -> str:
    return f"fam_{label}"


def load_seed(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if "manufacturers" not in data:
        raise SystemExit("catalog_seed.json invalide : clé 'manufacturers' manquante.")
    return data


# ---------------------------------------------------------------------------
# 2. Initialisation des tables de référence (familles & unités de mesure)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# 3. Upsert producteurs, marques et variantes catalogue
# ---------------------------------------------------------------------------


def upsert_manufacturer(cur: sqlite3.Cursor, mfr: dict) -> int:
    """Enregistre le producteur comme marque-porteuse sans doublon de nom."""
    code = mfr["code"]
    name = mfr["name"]
    existing = cur.execute(
        "SELECT id FROM brands WHERE name = ?", (name,)
    ).fetchone()
    if existing:
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


def upsert_brand(cur: sqlite3.Cursor, brand: dict, _mfr_id: int) -> int:
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


def _resolve_packaging_type(packaging) -> tuple[str, int]:
    if isinstance(packaging, dict):
        pkg_type = packaging.get("type", "")
        units = packaging.get("units", 24)
        return pkg_type, int(units) if units else 24
    pkg_type = str(packaging)
    return pkg_type, 24


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
        _label, material = CONTAINER_LABELS[variant["container"]]
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

        if packaging:
            pkg_type, units = _resolve_packaging_type(packaging)
            if pkg_type == "crate":
                ct_code = f"CT-{sku}"
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
    if packaging:
        pkg_type, _units = _resolve_packaging_type(packaging)
        if pkg_type == "crate":
            unit_code = "CASE"
        elif pkg_type == "pack":
            unit_code = "PACK"

    unit_row = cur.execute(
        "SELECT id FROM units_of_measure WHERE code = ?", (unit_code,)
    ).fetchone()
    unit_id_variant = unit_row[0] if unit_row else unit_id

    verification = variant.get("verification_status", "to_verify")
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


def seed(cur: sqlite3.Cursor, data: dict, dry_run: bool = False) -> dict:
    _ = dry_run
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
