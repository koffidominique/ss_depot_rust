import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { BusinessError } from './domain.ts';
import { BACKUP_DIR, getDb } from './db.ts';
import {
  getAuthStatus,
  setupOwnerPin,
  loginOwner,
  changeOwnerPin,
  verifyToken,
  revokeToken,
} from './services/auth.ts';
import {
  listCategories,
  createCategory,
  listProducts,
  createProduct,
  updateProduct,
  addOrUpdatePackaging,
  exportProductsCsv,
  importProductsCsv,
} from './services/catalog.ts';
import {
  listClients,
  createClient,
  updateClientCreditPolicy,
  createSale,
  listSales,
  getSaleDetail,
  cancelSale,
  createSaleReturn,
} from './services/sales.ts';
import {
  listSuppliers,
  createSupplier,
  listPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  paySupplierDebt,
  listSupplierDebts,
} from './services/purchases.ts';
import {
  getCashStatus,
  openCashSession,
  closeCashSession,
  listReceivables,
  payReceivable,
  listExpenses,
  createExpense,
  getStockOverview,
  listInventories,
  createInventory,
  validateInventory,
} from './services/finance.ts';
import {
  getConsignmentsOverview,
  createReturnableType,
  adjustReturnableStock,
  returnClientEmpties,
} from './services/consignments.ts';
import {
  getDashboardData,
  getReportsOverview,
  getSettings,
  updateSettings,
  addPaymentMethod,
  togglePaymentMethod,
  createBackup,
  listBackups,
  verifyBackup,
  restoreBackup,
} from './services/reports.ts';

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Initialise SQLite au démarrage
  getDb();

  const asyncHandler =
    (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
    };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!verifyToken(token)) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session verrouillée ou expirée.' });
      return;
    }
    next();
  };

  // Routes Auth publiques
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/status', (_req, res) => res.json(getAuthStatus()));
  app.post(
    '/api/auth/setup',
    asyncHandler(async (req, res) => {
      const result = await setupOwnerPin(String(req.body?.pin ?? ''));
      res.json(result);
    })
  );
  app.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      const result = await loginOwner(String(req.body?.pin ?? ''));
      res.json(result);
    })
  );
  app.post('/api/auth/lock', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    revokeToken(token);
    res.json({ locked: true });
  });

  // Routes protégées par session PIN
  app.use('/api', requireAuth);

  app.post(
    '/api/auth/change-pin',
    asyncHandler(async (req, res) => {
      await changeOwnerPin(String(req.body?.currentPin ?? ''), String(req.body?.newPin ?? ''));
      res.json({ ok: true });
    })
  );

  // Dashboard
  app.get('/api/dashboard', (_req, res) => res.json(getDashboardData()));

  // Catégories & Produits
  app.get('/api/categories', (_req, res) => res.json(listCategories()));
  app.post(
    '/api/categories',
    asyncHandler(async (req, res) => res.status(201).json(await createCategory(req.body?.name, req.body?.description)))
  );

  app.get('/api/products', (req, res) => {
    res.json(
      listProducts({
        search: req.query.search ? String(req.query.search) : undefined,
        categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
        includeArchived: req.query.includeArchived === 'true',
        lowStockOnly: req.query.lowStockOnly === 'true',
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
      })
    );
  });
  app.get('/api/products/export/csv', (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="depotpro_produits.csv"');
    res.send(exportProductsCsv());
  });
  app.post(
    '/api/products/import/csv',
    asyncHandler(async (req, res) => res.json(await importProductsCsv(String(req.body?.csv ?? ''))))
  );
  app.post(
    '/api/products',
    asyncHandler(async (req, res) => res.status(201).json(await createProduct(req.body)))
  );
  app.put(
    '/api/products/:id',
    asyncHandler(async (req, res) => res.json(await updateProduct(Number(req.params.id), req.body)))
  );
  app.post(
    '/api/products/:id/packagings',
    asyncHandler(async (req, res) =>
      res.json(await addOrUpdatePackaging(Number(req.params.id), req.body))
    )
  );

  // Clients & Crédit
  app.get('/api/clients', (req, res) =>
    res.json(listClients(req.query.search ? String(req.query.search) : undefined))
  );
  app.post(
    '/api/clients',
    asyncHandler(async (req, res) => res.status(201).json(await createClient(req.body)))
  );
  app.put(
    '/api/clients/:id/credit',
    asyncHandler(async (req, res) =>
      res.json(await updateClientCreditPolicy(Number(req.params.id), req.body))
    )
  );

  // Ventes, Annulations & Retours
  app.get('/api/sales', (req, res) => {
    res.json(
      listSales({
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
      })
    );
  });
  app.get('/api/sales/:id', (req, res) => res.json(getSaleDetail(Number(req.params.id))));
  app.post(
    '/api/sales',
    asyncHandler(async (req, res) => res.status(201).json(await createSale(req.body)))
  );
  app.post(
    '/api/sales/:id/cancel',
    asyncHandler(async (req, res) => res.json(await cancelSale(Number(req.params.id), req.body)))
  );
  app.post(
    '/api/sales/:id/returns',
    asyncHandler(async (req, res) => res.status(201).json(await createSaleReturn(Number(req.params.id), req.body)))
  );

  // Créances
  app.get('/api/receivables', (_req, res) => res.json(listReceivables()));
  app.post(
    '/api/receivables/:id/pay',
    asyncHandler(async (req, res) => res.json(await payReceivable(Number(req.params.id), req.body)))
  );

  // Fournisseurs & Approvisionnements
  app.get('/api/suppliers', (req, res) =>
    res.json(listSuppliers(req.query.search ? String(req.query.search) : undefined))
  );
  app.post(
    '/api/suppliers',
    asyncHandler(async (req, res) => res.status(201).json(await createSupplier(req.body)))
  );
  app.get('/api/purchases', (_req, res) => res.json(listPurchaseOrders()));
  app.post(
    '/api/purchases',
    asyncHandler(async (req, res) => res.status(201).json(await createPurchaseOrder(req.body)))
  );
  app.post(
    '/api/purchases/:id/receive',
    asyncHandler(async (req, res) =>
      res.status(201).json(await receivePurchaseOrder(Number(req.params.id), req.body))
    )
  );
  app.get('/api/supplier-debts', (_req, res) => res.json(listSupplierDebts()));
  app.post(
    '/api/supplier-debts/:id/pay',
    asyncHandler(async (req, res) => res.json(await paySupplierDebt(Number(req.params.id), req.body)))
  );

  // Stocks & Inventaires
  app.get('/api/stock', (_req, res) => res.json(getStockOverview()));
  app.get('/api/inventories', (_req, res) => res.json(listInventories()));
  app.post(
    '/api/inventories',
    asyncHandler(async (req, res) => res.status(201).json(await createInventory(req.body?.notes)))
  );
  app.post(
    '/api/inventories/:id/validate',
    asyncHandler(async (req, res) =>
      res.json(await validateInventory(Number(req.params.id), req.body?.lines || []))
    )
  );

  // Consignations
  app.get('/api/consignments', (_req, res) => res.json(getConsignmentsOverview()));
  app.post(
    '/api/consignments/types',
    asyncHandler(async (req, res) => res.status(201).json(await createReturnableType(req.body)))
  );
  app.post(
    '/api/consignments/stock-movements',
    asyncHandler(async (req, res) => res.status(201).json(await adjustReturnableStock(req.body)))
  );
  app.post(
    '/api/consignments/returns',
    asyncHandler(async (req, res) => res.status(201).json(await returnClientEmpties(req.body)))
  );

  // Caisse & Dépenses
  app.get('/api/cash', (_req, res) => res.json(getCashStatus()));
  app.post(
    '/api/cash/open',
    asyncHandler(async (req, res) => res.status(201).json(await openCashSession(req.body)))
  );
  app.post(
    '/api/cash/close',
    asyncHandler(async (req, res) => res.json(await closeCashSession(req.body)))
  );
  app.get('/api/expenses', (_req, res) => res.json(listExpenses()));
  app.post(
    '/api/expenses',
    asyncHandler(async (req, res) => res.status(201).json(await createExpense(req.body)))
  );

  // Rapports & Paramètres & Sauvegardes
  app.get('/api/reports', (req, res) =>
    res.json(
      getReportsOverview(
        req.query.from ? String(req.query.from) : undefined,
        req.query.to ? String(req.query.to) : undefined
      )
    )
  );
  app.get('/api/settings', (_req, res) => res.json(getSettings()));
  app.put(
    '/api/settings',
    asyncHandler(async (req, res) => res.json(await updateSettings(req.body)))
  );
  app.post(
    '/api/payment-methods',
    asyncHandler(async (req, res) => res.status(201).json(await addPaymentMethod(req.body?.label)))
  );
  app.put(
    '/api/payment-methods/:code',
    asyncHandler(async (req, res) =>
      res.json(await togglePaymentMethod(req.params.code, Boolean(req.body?.active)))
    )
  );

  app.get('/api/backups', (_req, res) => res.json(listBackups()));
  app.post(
    '/api/backups',
    asyncHandler(async (_req, res) => res.status(201).json(await createBackup()))
  );
  app.get('/api/backups/:name/verify', (req, res) => res.json(verifyBackup(req.params.name)));
  app.get('/api/backups/:name/download', (req, res) => {
    const safe = path.basename(req.params.name);
    const full = path.join(BACKUP_DIR, safe);
    if (!fs.existsSync(full)) {
      res.status(404).json({ code: 'BACKUP_ERROR', message: 'Sauvegarde introuvable.' });
      return;
    }
    res.download(full, safe);
  });
  app.post(
    '/api/backups/:name/restore',
    asyncHandler(async (req, res) => res.json(await restoreBackup(req.params.name)))
  );

  // Gestion d'erreurs métier propre (aucune fuite SQL)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BusinessError) {
      res.status(err.status).json({ code: err.code, message: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Erreur interne.';
    if (msg.includes('SQLITE_CONSTRAINT')) {
      res.status(409).json({ code: 'VALIDATION_ERROR', message: 'Contrainte d’intégrité ou doublon détecté.' });
      return;
    }
    console.error('[DEPOTPRO API ERROR]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Une erreur serveur est survenue.' });
  });

  return app;
}
