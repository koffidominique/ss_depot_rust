import type { DatabaseSync } from 'node:sqlite';
import { ensureNeutralDefaults } from './db.ts';

export interface SeedDemoOptions {
  force?: boolean;
  includeDemoCompany?: boolean;
}

export interface SeedDemoSummary {
  seeded: boolean;
  suppliersAdded: number;
  productsAdded: number;
  returnablesAdded: number;
  clientsAdded: number;
}

/**
 * Injecte un jeu de données de démonstration uniquement sur demande explicite de développement.
 * Jamais appelé lors de l'initialisation normale de l'application.
 */
export function seedDemoData(db: DatabaseSync, options: SeedDemoOptions = {}): SeedDemoSummary {
  if (process.env.NODE_ENV === 'production' && !options.force) {
    throw new Error(
      'Refus d’injecter des données de démonstration en environnement NODE_ENV=production sans --force.'
    );
  }

  ensureNeutralDefaults(db);

  const existingSuppliers = (db.prepare('SELECT COUNT(*) AS c FROM suppliers').get() as { c: number }).c;
  const existingProducts = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
  if (existingSuppliers > 0 || existingProducts > 0) {
    return {
      seeded: false,
      suppliersAdded: 0,
      productsAdded: 0,
      returnablesAdded: 0,
      clientsAdded: 0,
    };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (options.includeDemoCompany) {
      db.prepare(
        `UPDATE app_settings
         SET company_name = 'DEPOTPRO Démo',
             company_legal_name = 'Dépôt Boissons Démonstration',
             address = 'Zone Démonstration',
             phone = '+225 07 00 00 00 00',
             city = 'Abidjan',
             country = 'Côte d''Ivoire',
             setup_completed = 1
         WHERE id = 1`
      ).run();
    }

    const catByName = (name: string, desc: string): number => {
      db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)').run(name, desc);
      const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number };
      return row.id;
    };

    const cBiere = catByName('Bières', 'Bières en bouteille, canette ou casier');
    const cSoda = catByName('Boissons gazeuses', 'Sodas et boissons gazeuses');
    const cEau = catByName('Eaux minérales', 'Eaux plates et gazeuses');
    const cJus = catByName('Jus & Énergisants', 'Jus de fruits, nectars et boissons énergisantes');

    const insertSup = db.prepare(
      'INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const sSolibra = Number(
      insertSup.run('FRN-001', 'Brasserie Centrale (SOLIBRA)', 'SOLIBRA SA', '+225 27 21 21 00 00', 'Treichville Zone 3', 30)
        .lastInsertRowid
    );
    const sCeleste = Number(
      insertSup.run('FRN-002', 'Sources Minérales Réunies', 'SMR Distribution', '+225 27 22 44 10 00', 'Bonoua Route Principale', 15)
        .lastInsertRowid
    );

    const insertRet = db.prepare(
      'INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const rCasier24 = Number(
      insertRet.run('EMB-CAS24', 'Casier plastique 24 trous', 'SOLIBRA', 'crate', 'Casier standard 24 emplacements', 2500)
        .lastInsertRowid
    );
    const rBtl65 = Number(
      insertRet.run('EMB-BTL65', 'Bouteille verre 65cl', 'SOLIBRA', 'bottle', 'Bouteille verre consignée 65cl', 150)
        .lastInsertRowid
    );
    const rCasier12 = Number(
      insertRet.run('EMB-CAS12', 'Casier plastique 12 trous', 'SOLIBRA', 'crate', 'Casier standard 12 grandes bouteilles', 2000)
        .lastInsertRowid
    );

    const initRetStock = db.prepare('INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)');
    const initRetMov = db.prepare(
      "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document) VALUES (?, ?, 'initial', ?, 0, ?, ?, 'INIT-DEMO')"
    );
    initRetStock.run(rCasier24, 180);
    initRetMov.run('init-ret-cas24', rCasier24, 180, 180, 'Stock initial de démonstration');
    initRetStock.run(rBtl65, 4320);
    initRetMov.run('init-ret-btl65', rBtl65, 4320, 4320, 'Stock initial de démonstration');
    initRetStock.run(rCasier12, 95);
    initRetMov.run('init-ret-cas12', rCasier12, 95, 95, 'Stock initial de démonstration');

    const insertProd = db.prepare(
      `INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertPkg = db.prepare(
      `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertDepProf = db.prepare('INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)');
    const insertDepComp = db.prepare('INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)');

    const pFlag = Number(
      insertProd.run(
        'PROD-2026-00001', '3250001001011', 'Bière Flag Spéciale 65cl', 'Flag', cBiere, sSolibra,
        'bouteille', 480000, 120000, 1200000, '450', '1', 450, 500, 550, 600
      ).lastInsertRowid
    );
    const pkgFlagBtl = Number(insertPkg.run(pFlag, 'bouteille', 'bouteille', 1000, 450, 500, 550, 600, '3250001001011-B', 0).lastInsertRowid);
    const pkgFlagCas = Number(insertPkg.run(pFlag, 'casier', 'bouteille', 24000, 10800, 11800, 12500, 13500, '3250001001011-C', 0).lastInsertRowid);
    insertDepProf.run(pkgFlagBtl, 'deposit');
    insertDepComp.run(pkgFlagBtl, rBtl65, 1);
    insertDepProf.run(pkgFlagCas, 'deposit');
    insertDepComp.run(pkgFlagCas, rCasier24, 1);
    insertDepComp.run(pkgFlagCas, rBtl65, 24);

    const pBock = Number(
      insertProd.run(
        'PROD-2026-00002', '3250001001028', 'Bock Solibra 65cl', 'Solibra', cBiere, sSolibra,
        'bouteille', 288000, 72000, 960000, '400', '1', 400, 450, 475, 500
      ).lastInsertRowid
    );
    const pkgBockBtl = Number(insertPkg.run(pBock, 'bouteille', 'bouteille', 1000, 400, 450, 475, 500, '3250001001028-B', 0).lastInsertRowid);
    const pkgBockCas = Number(insertPkg.run(pBock, 'casier', 'bouteille', 12000, 4800, 5200, 5500, 6000, '3250001001028-C', 0).lastInsertRowid);
    insertDepProf.run(pkgBockBtl, 'deposit');
    insertDepComp.run(pkgBockBtl, rBtl65, 1);
    insertDepProf.run(pkgBockCas, 'deposit');
    insertDepComp.run(pkgBockCas, rCasier12, 1);
    insertDepComp.run(pkgBockCas, rBtl65, 12);

    const pCoca = Number(
      insertProd.run(
        'PROD-2026-00003', '5449000000996', 'Coca-Cola Original 33cl', 'Coca-Cola', cSoda, sSolibra,
        'canette', 720000, 144000, 2400000, '320', '1', 320, 375, 400, 450
      ).lastInsertRowid
    );
    const pkgCocaCan = Number(insertPkg.run(pCoca, 'canette', 'canette', 1000, 320, 375, 400, 450, '5449000000996-U', 0).lastInsertRowid);
    const pkgCocaCart = Number(insertPkg.run(pCoca, 'carton', 'canette', 24000, 7680, 8800, 9200, 10000, '5449000000996-K', 0).lastInsertRowid);
    insertDepProf.run(pkgCocaCan, 'none');
    insertDepProf.run(pkgCocaCart, 'none');

    const pEau = Number(
      insertProd.run(
        'PROD-2026-00004', '6181100400015', 'Eau Minérale Céleste 1.5L', 'Céleste', cEau, sCeleste,
        'bouteille', 600000, 120000, 1800000, '225', '1', 225, 250, 275, 300
      ).lastInsertRowid
    );
    const pkgEauBtl = Number(insertPkg.run(pEau, 'bouteille', 'bouteille', 1000, 225, 250, 275, 300, '6181100400015-B', 0).lastInsertRowid);
    const pkgEauPack = Number(insertPkg.run(pEau, 'pack', 'bouteille', 6000, 1350, 1500, 1600, 1800, '6181100400015-P', 0).lastInsertRowid);
    insertDepProf.run(pkgEauBtl, 'none');
    insertDepProf.run(pkgEauPack, 'none');

    const pMalta = Number(
      insertProd.run(
        'PROD-2026-00005', '6181100800129', 'Malta Guinness 33cl', 'Guinness', cJus, sSolibra,
        'canette', 48000, 72000, 720000, '380', '1', 380, 425, 450, 500
      ).lastInsertRowid
    );
    const pkgMaltaCan = Number(insertPkg.run(pMalta, 'canette', 'canette', 1000, 380, 425, 450, 500, '6181100800129-U', 0).lastInsertRowid);
    const pkgMaltaPack = Number(insertPkg.run(pMalta, 'pack', 'canette', 6000, 2280, 2500, 2650, 2900, '6181100800129-P', 0).lastInsertRowid);
    const pkgMaltaCart = Number(insertPkg.run(pMalta, 'carton', 'canette', 24000, 9120, 9800, 10400, 11500, '6181100800129-K', 0).lastInsertRowid);
    insertDepProf.run(pkgMaltaCan, 'none');
    insertDepProf.run(pkgMaltaPack, 'none');
    insertDepProf.run(pkgMaltaCart, 'none');

    db.prepare(
      `INSERT INTO document_sequences (prefix, year, last_number) VALUES ('PROD', ?, 5)
       ON CONFLICT(prefix, year) DO UPDATE SET last_number = MAX(last_number, 5)`
    ).run(new Date().getFullYear());

    const insertCli = db.prepare(
      'INSERT INTO clients (code, name, client_type, phone, address, city) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertCredit = db.prepare(
      'INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, ?, ?, ?)'
    );

    const clComptoir = Number(
      insertCli.run('CLI-001', 'Client Comptoir', 'particulier', '', 'Vente directe au dépôt', 'Abidjan').lastInsertRowid
    );
    insertCredit.run(clComptoir, 'forbidden', null, 0);

    const clMaquis = Number(
      insertCli.run('CLI-002', 'Maquis Le Prestige', 'professionnel', '+225 05 44 12 88 90', 'Rue des Jardins, Cocody', 'Abidjan').lastInsertRowid
    );
    insertCredit.run(clMaquis, 'limited', 500000, 15);

    const clHotel = Number(
      insertCli.run('CLI-003', 'Hôtel La Lagune', 'professionnel', '+225 01 02 33 44 55', 'Boulevard de Marseille', 'Abidjan').lastInsertRowid
    );
    insertCredit.run(clHotel, 'unlimited', null, 30);

    db.exec('COMMIT;');
    return {
      seeded: true,
      suppliersAdded: 2,
      productsAdded: 5,
      returnablesAdded: 3,
      clientsAdded: 3,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback failure
    }
    throw err;
  }
}
