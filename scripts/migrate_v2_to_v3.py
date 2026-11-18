#!/usr/bin/env python3
"""
DEPOTPRO V2 (Python/SQLAlchemy) -> V3 (SQLite exact integer FCFA & milli_units)
Migration non destructive sur copie avec détection d'anomalies sans arrondi silencieux.
"""
import argparse
import json
import os
import shutil
import sqlite3
from decimal import Decimal, InvalidOperation
from pathlib import Path


def parse_exact_fcfa(raw, field_name: str, anomalies: list):
    if raw is None:
        return None
    try:
        dec = Decimal(str(raw).strip())
    except InvalidOperation:
        anomalies.append(f"{field_name}: valeur non numérique '{raw}'")
        return None
    if dec % 1 != 0:
        anomalies.append(f"{field_name}: montant FCFA fractionnaire interdit '{raw}' (aucun arrondi silencieux)")
        return None
    return int(dec)


def parse_exact_milli(raw, field_name: str, anomalies: list):
    if raw is None:
        return None
    try:
        dec = Decimal(str(raw).strip())
    except InvalidOperation:
        anomalies.append(f"{field_name}: quantité non numérique '{raw}'")
        return None
    scaled = dec * Decimal(1000)
    if scaled % 1 != 0:
        anomalies.append(f"{field_name}: précision > 3 décimales '{raw}' (refus d'arrondi silencieux)")
        return None
    return int(scaled)


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    ).fetchone()
    return row is not None


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

    schema_sql = schema_sql_path.read_text(encoding="utf-8")
    dst.executescript(schema_sql)

    # Appliquer également les migrations SQL séquentielles suivantes (ex: 0004_onboarding_setup_state)
    migrations_dir = schema_sql_path.parent
    for mig_path in sorted(migrations_dir.glob("*.sql")):
        stem = mig_path.stem
        prefix = stem.split("_", 1)[0]
        if not prefix.isdigit():
            continue
        ver = int(prefix)
        if ver <= 1:
            continue
        if ver == 2:
            cols = [r[1] for r in dst.execute("PRAGMA table_info(app_settings)").fetchall()]
            if "logo_path" not in cols:
                dst.executescript(mig_path.read_text(encoding="utf-8"))
        elif ver == 3:
            cols = [r[1] for r in dst.execute("PRAGMA table_info(expenses)").fetchall()]
            if "receipt_path" not in cols:
                dst.executescript(mig_path.read_text(encoding="utf-8"))
        elif ver == 4:
            cols = [r[1] for r in dst.execute("PRAGMA table_info(app_settings)").fetchall()]
            if "setup_completed" not in cols:
                dst.executescript(mig_path.read_text(encoding="utf-8"))
        else:
            dst.executescript(mig_path.read_text(encoding="utf-8"))
        dst.execute("INSERT OR REPLACE INTO schema_version (version, name) VALUES (?, ?)", (ver, stem))

    anomalies = []
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

    # Payment methods baseline
    for code, label, is_cash in [
        ("cash", "Espèces", 1),
        ("wave", "Wave", 0),
        ("orange_money", "Orange Money", 0),
        ("mtn_money", "MTN Money", 0),
        ("transfer", "Virement / Chèque", 0),
    ]:
        dst.execute(
            "INSERT OR IGNORE INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, ?, 1)",
            (code, label, is_cash),
        )

    # Settings
    if table_exists(src, "app_settings"):
        row = src.execute("SELECT * FROM app_settings LIMIT 1").fetchone()
        if row:
            dst.execute(
                """INSERT OR REPLACE INTO app_settings
                   (id, company_name, phone, address, city, allow_negative_stock, setup_completed)
                   VALUES (1, ?, ?, ?, ?, ?, 1)""",
                (
                    row["company_name"] if "company_name" in row.keys() and row["company_name"] else "Mon Dépôt",
                    row["phone"] if "phone" in row.keys() else None,
                    row["address"] if "address" in row.keys() else None,
                    row["city"] if "city" in row.keys() else None,
                    int(bool(row["allow_negative_stock"])) if "allow_negative_stock" in row.keys() else 0,
                ),
            )
    dst.execute(
        """INSERT OR IGNORE INTO app_settings
           (id, company_name, company_legal_name, address, phone, email, city, country, currency, setup_completed)
           VALUES (1, 'Mon Dépôt', NULL, NULL, NULL, NULL, NULL, NULL, 'FCFA', 0)"""
    )

    # Owner security (preserve existing bcrypt hash without default PIN)
    if table_exists(src, "owner_security"):
        sec = src.execute("SELECT * FROM owner_security LIMIT 1").fetchone()
        if sec and "pin_hash" in sec.keys():
            dst.execute(
                "INSERT OR REPLACE INTO owner_security (id, pin_hash, failed_attempts) VALUES (1, ?, 0)",
                (sec["pin_hash"],),
            )

    # Categories
    cat_count = 0
    if table_exists(src, "categories"):
        for r in src.execute("SELECT * FROM categories").fetchall():
            dst.execute(
                "INSERT OR IGNORE INTO categories (id, name, description, is_active) VALUES (?, ?, ?, ?)",
                (r["id"], r["name"], r["description"] if "description" in r.keys() else None, 1),
            )
            cat_count += 1
    report["counts"]["categories"] = cat_count

    # Suppliers
    sup_count = 0
    if table_exists(src, "suppliers"):
        for r in src.execute("SELECT * FROM suppliers").fetchall():
            code = r["code"] if "code" in r.keys() and r["code"] else f"FOUR-{r['id']:04d}"
            phone = r["phone"] if "phone" in r.keys() and r["phone"] else "Non renseigné"
            dst.execute(
                "INSERT OR IGNORE INTO suppliers (id, code, name, phone, is_active) VALUES (?, ?, ?, ?, ?)",
                (r["id"], code, r["name"], phone, int(bool(r["is_active"])) if "is_active" in r.keys() else 1),
            )
            sup_count += 1
    report["counts"]["suppliers"] = sup_count

    # Products
    prod_count = 0
    if table_exists(src, "products"):
        for r in src.execute("SELECT * FROM products").fetchall():
            keys = r.keys()
            stock_milli = parse_exact_milli(
                r["stock_quantity"] if "stock_quantity" in keys else 0,
                f"products[{r['id']}].stock_quantity",
                anomalies,
            )
            min_milli = parse_exact_milli(
                r["min_stock"] if "min_stock" in keys else 0,
                f"products[{r['id']}].min_stock",
                anomalies,
            )
            retail = parse_exact_fcfa(
                r["retail_price"] if "retail_price" in keys else None,
                f"products[{r['id']}].retail_price",
                anomalies,
            )
            wholesale = parse_exact_fcfa(
                r["wholesale_price"] if "wholesale_price" in keys else None,
                f"products[{r['id']}].wholesale_price",
                anomalies,
            )
            semi = parse_exact_fcfa(
                r["semi_wholesale_price"] if "semi_wholesale_price" in keys else None,
                f"products[{r['id']}].semi_wholesale_price",
                anomalies,
            )
            purchase = parse_exact_fcfa(
                r["purchase_price"] if "purchase_price" in keys else None,
                f"products[{r['id']}].purchase_price",
                anomalies,
            )
            if stock_milli is None or min_milli is None:
                continue
            avg_num = str(purchase) if purchase is not None else None
            avg_den = "1" if purchase is not None else None
            dst.execute(
                """INSERT OR IGNORE INTO products
                   (id, reference, barcode, name, brand, category_id, supplier_id, base_unit,
                    stock_milli, min_stock_milli, average_cost_num, average_cost_den,
                    purchase_price, wholesale_price, semi_wholesale_price, retail_price, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    r["id"],
                    r["reference"] if "reference" in keys and r["reference"] else f"PROD-LEG-{r['id']:05d}",
                    r["barcode"] if "barcode" in keys else None,
                    r["name"],
                    r["brand"] if "brand" in keys else None,
                    r["category_id"] if "category_id" in keys and r["category_id"] else 1,
                    r["supplier_id"] if "supplier_id" in keys else None,
                    r["base_unit"] if "base_unit" in keys and r["base_unit"] else "bouteille",
                    stock_milli,
                    min_milli,
                    avg_num,
                    avg_den,
                    purchase,
                    wholesale,
                    semi,
                    retail,
                    int(bool(r["is_active"])) if "is_active" in keys else 1,
                ),
            )
            prod_count += 1
    report["counts"]["products"] = prod_count

    # Product packagings
    pkg_count = 0
    if table_exists(src, "product_packagings"):
        for r in src.execute("SELECT * FROM product_packagings").fetchall():
            keys = r.keys()
            coeff_milli = parse_exact_milli(
                r["coefficient"] if "coefficient" in keys else 1,
                f"product_packagings[{r['id']}].coefficient",
                anomalies,
            )
            if not coeff_milli or coeff_milli <= 0:
                anomalies.append(f"product_packagings[{r['id']}]: coefficient <= 0 ignoré")
                continue
            purchase = parse_exact_fcfa(r["purchase_price"] if "purchase_price" in keys else None, f"pkg[{r['id']}].purchase", anomalies)
            retail = parse_exact_fcfa(r["retail_price"] if "retail_price" in keys else None, f"pkg[{r['id']}].retail", anomalies)
            wholesale = parse_exact_fcfa(r["wholesale_price"] if "wholesale_price" in keys else None, f"pkg[{r['id']}].wholesale", anomalies)
            semi = parse_exact_fcfa(r["semi_wholesale_price"] if "semi_wholesale_price" in keys else None, f"pkg[{r['id']}].semi", anomalies)
            dst.execute(
                """INSERT OR IGNORE INTO product_packagings
                   (id, product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (
                    r["id"],
                    r["product_id"],
                    r["name"],
                    r["base_unit"] if "base_unit" in keys and r["base_unit"] else "bouteille",
                    coeff_milli,
                    purchase,
                    wholesale,
                    semi,
                    retail,
                ),
            )
            # Profil consigne explicite requis avant toute vente (jamais de consigne implicite)
            dst.execute(
                "INSERT OR IGNORE INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')",
                (r["id"],),
            )
            pkg_count += 1
    report["counts"]["product_packagings"] = pkg_count

    # Clients & explicit credit policies (jamais de plafond inventé)
    cli_count = 0
    if table_exists(src, "clients"):
        for r in src.execute("SELECT * FROM clients").fetchall():
            keys = r.keys()
            code = r["code"] if "code" in keys and r["code"] else f"CLI-{r['id']:04d}"
            dst.execute(
                "INSERT OR IGNORE INTO clients (id, code, name, client_type, phone, is_active) VALUES (?, ?, ?, ?, ?, 1)",
                (r["id"], code, r["name"], "particulier", r["phone"] if "phone" in keys else None),
            )
            dst.execute(
                "INSERT OR IGNORE INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'forbidden', NULL, 0)",
                (r["id"],),
            )
            cli_count += 1
    report["counts"]["clients"] = cli_count

    dst.execute("INSERT OR REPLACE INTO schema_version (version, name) VALUES (1, '0001_initial_v3_migrated')")
    dst.commit()

    integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
    fk_errors = dst.execute("PRAGMA foreign_key_check").fetchall()
    report["integrity_check"] = integrity
    report["foreign_key_errors"] = len(fk_errors)

    src.close()
    dst.close()

    if strict and (anomalies or integrity != "ok" or len(fk_errors) > 0):
        raise SystemExit(f"Migration rejetée en mode strict: {json.dumps(report, ensure_ascii=False, indent=2)}")

    return report


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
