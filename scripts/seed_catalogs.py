#!/usr/bin/env python3
"""Seed catalogue depuis solibra_catalog.json et brassivoire_catalog.json → SQLite."""
import argparse, json, sqlite3, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = Path(os.environ.get("DEPOTPRO_DB", ROOT / "data/depotpro_v3.db"))

UNIT_MAP = {"crate": "CASE", "unit": "PIECE", "piece": "PIECE", "pack": "PACK", "carton": "PIECE"}
CONTAINER_LABELS = {"glass_bottle": ("Bouteille en verre","glass"), "glass": ("Bouteille en verre","glass"),
                    "pet_bottle": ("Bouteille PET","plastic"), "can": ("Canette aluminium","other"),
                    "returnable_glass_bottle": ("Bouteille en verre","glass")}


def ensure_units(cur):
    for code,name,sym,utype,factor in [("PIECE","Pièce","pcs","piece",1.0),("CASE","Casier","casier","case",1.0),("PACK","Pack","pack","pack",1.0)]:
        cur.execute("INSERT OR IGNORE INTO units_of_measure (code,name,symbol,unit_type,conversion_factor,is_active) VALUES (?,?,?,?,?,1)",(code,name,sym,utype,factor))

def family_id(cur, name):
    code = "FAM-" + name.upper().replace(" ","-")[:20]
    cur.execute("INSERT OR IGNORE INTO product_families (code,name,category,is_active) VALUES (?,?,?,1)",(code,name,name))
    return cur.execute("SELECT id FROM product_families WHERE code=?",(code,)).fetchone()[0]

def brand_id(cur, name, country=None, desc=None):
    row = cur.execute("SELECT id FROM brands WHERE name=?",(name,)).fetchone()
    if row: 
        cur.execute("UPDATE brands SET country_of_origin=COALESCE(?,country_of_origin), description=COALESCE(?,description) WHERE id=?",(country,desc,row[0]))
        return row[0]
    code = "BR-" + name.upper().replace(" ","-")[:20]
    cur.execute("INSERT INTO brands (code,name,description,country_of_origin,is_active) VALUES (?,?,?,?,1)",(code,name,desc,country))
    return cur.execute("SELECT id FROM brands WHERE code=?",(code,)).fetchone()[0]

def seed_one(cur, data):
    supplier = data.get("supplier",{})
    bname = supplier.get("name","UNKNOWN")
    bid = brand_id(cur, bname, supplier.get("country"), data.get("catalog_name"))
    # categories
    catmap = {}
    for c in data.get("categories",[]):
        catmap[c["id"]] = family_id(cur, c["name"])
    # default category fallback
    for p in data.get("products",[]):
        fid = catmap.get(p.get("category_id"))
        for v in p.get("variants",[]):
            sku = v["id"]
            name = v.get("display_name") or v.get("name") or sku
            # unit
            unit_code = "PIECE"
            cp = v.get("commercial_packaging",[])
            if cp:
                first = cp[0].get("unit_id")
                unit_code = UNIT_MAP.get(first,"PIECE")
            # volume
            vol = v.get("volume_ml")
            bp_id = None
            ct_id = None
            if vol:
                bp_code = f"BP-{sku}"
                cur.execute("INSERT INTO bottle_profiles (code,name,producer,material,capacity_ml,deposit_value,description,is_active) VALUES (?,?,?, ?,?,0,NULL,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name",
                            (bp_code, f"Profil {name}", "SEED", "glass", vol))
                bp_id = cur.execute("SELECT id FROM bottle_profiles WHERE code=?",(bp_code,)).fetchone()[0]
                # crate type if packaging has crate
                has_crate = any(cp.get("unit_id")=="crate" for cp in (v.get("commercial_packaging") or [])) if isinstance(v.get("commercial_packaging"),list) else False
                if has_crate:
                    units = 24
                    for cp in v.get("commercial_packaging",[]):
                        if cp.get("unit_id")=="crate" and cp.get("units_per_package"):
                            units = cp["units_per_package"]
                    ct_code = f"CT-{sku}"
                    cur.execute("INSERT INTO crate_types (code,name,producer,capacity,bottle_capacity_ml,bottle_profile_id,material,deposit_value,description,is_active) VALUES (?,?,?, ?,?,?, 'plastic',0,NULL,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name, capacity=excluded.capacity",
                                (ct_code, f"Conditionnement {name}", "SEED", units, vol, bp_id))
                    ct_id = cur.execute("SELECT id FROM crate_types WHERE code=?",(ct_code,)).fetchone()[0]
            uid = cur.execute("SELECT id FROM units_of_measure WHERE code=?",(unit_code,)).fetchone()[0]
            cur.execute("""INSERT INTO catalogue_products (code,name,brand_id,family_id,bottle_profile_id,crate_type_id,unit_id,unit_price,deposit_per_unit,is_active,is_sellable)
                          VALUES (?,?,?,?,?,?,?,?,?,1,0)
                          ON CONFLICT(code) DO UPDATE SET name=excluded.name, brand_id=excluded.brand_id, family_id=excluded.family_id,
                          bottle_profile_id=COALESCE(excluded.bottle_profile_id,catalogue_products.bottle_profile_id),
                          crate_type_id=COALESCE(excluded.crate_type_id,catalogue_products.crate_type_id)""",
                        (sku,name,bid,fid,bp_id,ct_id,uid,0,0))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--db",type=Path,default=DEFAULT_DB)
    ap.add_argument("jsons",nargs="+",type=Path)
    args=ap.parse_args()
    con=sqlite3.connect(args.db)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        cur=con.cursor()
        ensure_units(cur)
        for j in args.jsons:
            data=json.loads(j.read_text(encoding="utf-8"))
            seed_one(cur,data)
            print("seeded",j.name)
        con.commit()
    except Exception as e:
        con.rollback(); raise
    finally:
        con.close()

if __name__=="__main__":
    main()
