import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  toMilli,
  nonNegativeMilli,
  positiveMilli,
  formatMilli,
  nonNegativeFcfa,
  positiveFcfa,
  computeLineTotalFcfa,
} from '../server/domain.ts';
import { formatFcfa, formatQty } from '../src/utils/format.ts';

describe('DEPOTPRO PREMIUM V3 — Contrats Frontend / Rust / Tauri & Précision', () => {
  it('Précision FCFA et quantités *_milli sans float silencieux', () => {
    assert.equal(toMilli('10', 'test'), 10_000);
    assert.equal(toMilli('0.5', 'test'), 500);
    assert.equal(toMilli('1,250', 'test'), 1_250);
    assert.equal(formatMilli(24_000), '24');
    assert.equal(formatMilli(1_500), '1.5');
    assert.throws(() => toMilli('1.2345', 'test'));
    assert.throws(() => positiveMilli('0', 'test'));
    assert.equal(nonNegativeMilli('0', 'test'), 0);

    assert.equal(nonNegativeFcfa(0, 'test'), 0);
    assert.throws(() => positiveFcfa(0, 'test'));
    assert.throws(() => nonNegativeFcfa(12.5, 'test'));
    assert.equal(computeLineTotalFcfa(1_500, 1_000), 1_500);
    assert.throws(() => computeLineTotalFcfa(1, 10));

    assert.equal(formatQty(24_000, 'bouteille'), '24 bouteille');
    assert.equal(formatQty(1_500), '1,5');
    assert.ok(formatFcfa(50_000).endsWith('FCFA'));
  });

  it('Parité 100 % des méthodes ApiClient entre HttpApiClient et TauriApiClient', () => {
    const apiClientSrc = fs.readFileSync(path.resolve('src/services/api/ApiClient.ts'), 'utf8');
    const httpSrc = fs.readFileSync(path.resolve('src/services/api/HttpApiClient.ts'), 'utf8');
    const tauriSrc = fs.readFileSync(path.resolve('src/services/api/TauriApiClient.ts'), 'utf8');

    const methodRegex = /^\s{2}([a-zA-Z0-9_]+)\(/gm;
    const expectedMethods = new Set();
    let match;
    while ((match = methodRegex.exec(apiClientSrc)) !== null) {
      if (match[1] !== 'constructor') expectedMethods.add(match[1]);
    }
    assert.ok(expectedMethods.size >= 40, 'Doit couvrir au moins 40 méthodes ApiClient');

    for (const m of expectedMethods) {
      assert.match(httpSrc, new RegExp(`\\b${m}\\(`), `HttpApiClient doit implémenter ${m}`);
      assert.match(tauriSrc, new RegExp(`\\b${m}\\(`), `TauriApiClient doit implémenter ${m}`);
    }
  });

  it('Toutes les commandes invoquées par TauriApiClient existent dans commands.rs et lib.rs', () => {
    const tauriSrc = fs.readFileSync(path.resolve('src/services/api/TauriApiClient.ts'), 'utf8');
    const commandsSrc = fs.readFileSync(path.resolve('src-tauri/src/commands.rs'), 'utf8');
    const libSrc = fs.readFileSync(path.resolve('src-tauri/src/lib.rs'), 'utf8');

    const invokeRegex = /tauriInvoke[^(]*\('([a-z0-9_]+)'/g;
    const invokedCmds = new Set();
    let m;
    while ((m = invokeRegex.exec(tauriSrc)) !== null) {
      invokedCmds.add(m[1]);
    }
    assert.ok(invokedCmds.size >= 40, `Attendu >= 40 commandes, trouvé ${invokedCmds.size}`);

    for (const cmd of invokedCmds) {
      assert.match(
        commandsSrc,
        new RegExp(`pub async fn ${cmd}\\b`),
        `src-tauri/src/commands.rs doit exposer ${cmd}`
      );
      assert.match(
        libSrc,
        new RegExp(`commands::${cmd}\\b`),
        `src-tauri/src/lib.rs doit enregistrer commands::${cmd}`
      );
    }
  });

  it('Toutes les routes HttpApiClient existent dans server/app.ts et crates/depotpro-server', () => {
    const serverAppSrc = fs.readFileSync(path.resolve('server/app.ts'), 'utf8');
    const axumSrc = fs.readFileSync(path.resolve('crates/depotpro-server/src/main.rs'), 'utf8');

    const criticalPaths = [
      '/api/health',
      '/api/auth/status',
      '/api/auth/setup',
      '/api/auth/login',
      '/api/auth/me',
      '/api/auth/lock',
      '/api/auth/change-pin',
      '/api/auth/users',
      '/api/auth/users/:id/status',
      '/api/dashboard',
      '/api/categories',
      '/api/products',
      '/api/products/presets',
      '/api/products/presets/apply',
      '/api/products/export/csv',
      '/api/products/import/csv',
      '/api/clients',
      '/api/sales',
      '/api/receivables',
      '/api/suppliers',
      '/api/purchases',
      '/api/supplier-debts',
      '/api/stock',
      '/api/stock/adjust',
      '/api/inventories',
      '/api/consignments',
      '/api/cash',
      '/api/expenses',
      '/api/reports',
      '/api/settings',
      '/api/payment-methods',
      '/api/documents/pdf',
      '/api/backups',
      '/api/backups/encrypted',
      '/api/backups/:name/verify-encrypted',
      '/api/backups/:name/download',
      '/api/backups/:name/restore-encrypted',
    ];

    for (const route of criticalPaths) {
      assert.ok(serverAppSrc.includes(route), `Express server/app.ts doit exposer ${route}`);
      assert.ok(axumSrc.includes(route), `Axum depotpro-server doit exposer ${route}`);
    }
  });

  it('Les 9 documents imprimables obligatoires (Partie 21) sont déclarés dans DocumentPrintModal et les générateurs PDF natifs', () => {
    const modalSrc = fs.readFileSync(
      path.resolve('src/components/documents/DocumentPrintModal.tsx'),
      'utf8'
    );
    const nodePdfSrc = fs.readFileSync(path.resolve('server/services/pdf.ts'), 'utf8');
    const rustPdfSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/pdf.rs'),
      'utf8'
    );
    const requiredDocTypes = [
      'FACTURE',
      'REÇU DE VENTE',
      'AVOIR CLIENT',
      'BON DE COMMANDE',
      'BON DE RÉCEPTION',
      'REÇU RETOUR EMBALLAGES',
      'RAPPORT DE CAISSE',
      'ÉTAT DES CRÉANCES CLIENTS',
      'RAPPORT DE STOCK & VALORISATION',
      'BILAN COMMERCIAL & FINANCES',
      'ÉTAT DES DETTES FOURNISSEURS',
      'ÉTAT DES CONSIGNATIONS',
    ];
    for (const docType of requiredDocTypes) {
      assert.ok(modalSrc.includes(docType), `DocumentPrintModal doit gérer ${docType}`);
      assert.ok(nodePdfSrc.includes(docType), `server/services/pdf.ts doit gérer ${docType}`);
      assert.ok(rustPdfSrc.includes(docType), `crates/depotpro-core/src/application/pdf.rs doit gérer ${docType}`);
    }
  });

  it('Couverture complète des conseils métier (formulaires, onglets, routes) et parité daily_sales Rust', async () => {
    const { BUSINESS_TIPS_TOPICS, resolveTopicIdFromPath } = await import('../src/data/businessTips.ts');
    const appRoutes = [
      '/',
      '/sales/new',
      '/sales',
      '/clients',
      '/debts',
      '/products',
      '/stock',
      '/inventories',
      '/consignments',
      '/suppliers',
      '/purchases',
      '/cash',
      '/expenses',
      '/reports',
      '/settings',
      '/backups',
    ];
    const topicIds = new Set(BUSINESS_TIPS_TOPICS.map((t) => t.id));
    for (const route of appRoutes) {
      const resolved = resolveTopicIdFromPath(route);
      assert.ok(topicIds.has(resolved), `Route ${route} doit résoudre vers un topic valide`);
    }
    for (const topic of BUSINESS_TIPS_TOPICS) {
      assert.ok(topic.goldenRule.length > 10, `${topic.id} doit avoir une règle métier`);
      assert.ok(topic.fields.length >= 1, `${topic.id} doit documenter au moins 1 champ de formulaire`);
      assert.ok(topic.tabs.length >= 1, `${topic.id} doit documenter au moins 1 onglet/flux`);
      assert.ok(topic.pitfalls.length >= 1, `${topic.id} doit contenir au moins 1 point d'attention`);
    }

    const rustReportsSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/reports.rs'),
      'utf8'
    );
    const rustSalesSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/sales.rs'),
      'utf8'
    );
    const rustCashSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/cash.rs'),
      'utf8'
    );
    const rustPurchasesSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/purchases.rs'),
      'utf8'
    );
    const rustConsignmentsSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/consignments.rs'),
      'utf8'
    );
    const rustBackupSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/infrastructure/backup.rs'),
      'utf8'
    );

    assert.ok(rustReportsSrc.includes('pub daily_sales: Vec<DailySalePointDto>'));
    assert.ok(rustReportsSrc.includes('pub struct DashboardDataDto'));
    assert.ok(rustReportsSrc.includes('knownValuationFcfa'));
    assert.ok(rustSalesSrc.includes('pub struct PaginatedSalesDto'));
    assert.ok(rustSalesSrc.includes('pub payment_labels: Option<String>'));
    assert.ok(rustCashSrc.includes('pub summary: Option<CashSummaryDto>'));
    assert.ok(rustPurchasesSrc.includes('pub lines: Vec<PurchaseOrderLineDto>'));
    assert.ok(rustConsignmentsSrc.includes('pub recent_movements: Vec<ReturnableMovementDto>'));
    assert.ok(rustBackupSrc.includes('pub async fn restore_and_reconnect'));

    const rustProductsSrc = fs.readFileSync(
      path.resolve('crates/depotpro-core/src/application/products.rs'),
      'utf8'
    );
    assert.ok(rustProductsSrc.includes('sanitize_image_path'));
    assert.ok(rustProductsSrc.includes('pub image_path: Option<String>'));
    assert.ok(rustProductsSrc.includes('pub async fn list_catalog_presets'));
    assert.ok(rustProductsSrc.includes('pub async fn apply_catalog_presets'));
    assert.ok(rustCashSrc.includes('pub receipt_path: Option<String>'));

    const {
      buildCsv,
      exportCashMovementsCsv,
      exportCashSessionsCsv,
      exportPurchasesCsv,
      exportConsignmentBalancesCsv,
      exportConsignmentMovementsCsv,
    } = await import('../src/utils/csv.ts');
    const csvSample = buildCsv(['Référence', 'Montant'], [['VTE-001', 1500], ['Note; "spéciale"', 2000]]);
    assert.equal(csvSample, 'Référence;Montant\nVTE-001;1500\n"Note; ""spéciale""";2000');
    assert.equal(typeof exportCashMovementsCsv, 'function');
    assert.equal(typeof exportCashSessionsCsv, 'function');
    assert.equal(typeof exportPurchasesCsv, 'function');
    assert.equal(typeof exportConsignmentBalancesCsv, 'function');
    assert.equal(typeof exportConsignmentMovementsCsv, 'function');

    assert.ok(fs.existsSync(path.resolve('docs/USER_GUIDE.md')), 'docs/USER_GUIDE.md doit exister');
    assert.ok(rustSalesSrc.includes('from_date: Option<&str>'));
    assert.ok(rustSalesSrc.includes('to_date: Option<&str>'));

    const requiredTauriAssets = [
      'src-tauri/build.rs',
      'src-tauri/icons/32x32.png',
      'src-tauri/icons/128x128.png',
      'src-tauri/icons/128x128@2x.png',
      'src-tauri/icons/icon.png',
      'src-tauri/icons/icon.ico',
      'src-tauri/icons/icon.icns',
    ];
    for (const asset of requiredTauriAssets) {
      assert.ok(fs.existsSync(path.resolve(asset)), `${asset} doit exister pour le bundling Tauri 2`);
    }

    assert.ok(rustBackupSrc.includes('prune_old_backups'));

    const tauriCommandsSrc = fs.readFileSync(path.resolve('src-tauri/src/commands.rs'), 'utf8');
    const tauriLibSrc = fs.readFileSync(path.resolve('src-tauri/src/lib.rs'), 'utf8');
    const tauriClientSrc = fs.readFileSync(
      path.resolve('src/services/api/TauriApiClient.ts'),
      'utf8'
    );
    assert.ok(tauriCommandsSrc.includes('pub async fn adjust_stock'));
    assert.ok(tauriLibSrc.includes('commands::adjust_stock'));
    assert.ok(tauriClientSrc.includes("'adjust_stock'"));
    assert.ok(tauriCommandsSrc.includes('pub async fn update_client'));
    assert.ok(tauriCommandsSrc.includes('pub async fn update_supplier'));
    assert.ok(tauriLibSrc.includes('commands::update_client'));
    assert.ok(tauriLibSrc.includes('commands::update_supplier'));
    assert.ok(tauriClientSrc.includes("'update_client'"));
    assert.ok(tauriClientSrc.includes("'update_supplier'"));

    const serverAppSrc = fs.readFileSync(path.resolve('server/app.ts'), 'utf8');
    const axumSrc = fs.readFileSync(path.resolve('crates/depotpro-server/src/main.rs'), 'utf8');
    for (const r of ['/api/clients/:id', '/api/suppliers/:id']) {
      assert.ok(serverAppSrc.includes(r), `Express doit exposer ${r}`);
      assert.ok(axumSrc.includes(r), `Axum doit exposer ${r}`);
    }
    for (const marker of [
      'X_CONTENT_TYPE_OPTIONS',
      'X_FRAME_OPTIONS',
      'REFERRER_POLICY',
      'FORBIDDEN_ORIGIN',
      'RATE_LIMITED',
      'AuthRateLimiter',
      'is_allowed_origin',
      'security_middleware',
    ]) {
      assert.ok(axumSrc.includes(marker), `crates/depotpro-server doit inclure ${marker}`);
    }
  });
});
