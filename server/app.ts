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
  updateClient,
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
  updateSupplier,
  listPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
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
  adjustStock,
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
import { generateDocumentPdf } from './services/pdf.ts';

export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  // Initialise SQLite au démarrage
  getDb();

  // En-têtes de sécurité et protection CSRF / Origine locale (Partie 15.4)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (process.env.DEPOTPRO_ALLOW_FRAME !== 'true') {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    const origin = req.headers.origin;
    if (origin && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const host = req.headers.host || '';
      const forwardedHost = String(req.headers['x-forwarded-host'] || '')
        .split(',')[0]
        .trim();
      const matchesHost = (h: string) =>
        Boolean(h) && (origin === `http://${h}` || origin === `https://${h}`);
      const isLocalOrigin =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
        matchesHost(host) ||
        matchesHost(forwardedHost);
      const extraOrigins = (process.env.DEPOTPRO_ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const matchesExtra = extraOrigins.some((pattern) => {
        if (pattern.startsWith('https://*.') || pattern.startsWith('http://*.')) {
          const [scheme, rest] = pattern.split('://*.');
          try {
            const parsed = new URL(origin);
            return parsed.protocol === `${scheme}:` && parsed.hostname.endsWith(`.${rest}`);
          } catch {
            return false;
          }
        }
        return origin === pattern;
      });
      const isAllowed = isLocalOrigin || matchesExtra;
      if (!isAllowed) {
        res.status(403).json({
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origine requête non autorisée.',
        });
        return;
      }
    }
    next();
  });

  // Limitation de débit sur les routes d'authentification sensibles (fenêtre 60s)
  const authBuckets = new Map<string, { count: number; resetAt: number }>();
  const authRateLimit = (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const bucket = authBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      authBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > 25) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes d’authentification. Patientez une minute.',
      });
      return;
    }
    next();
  };

  const asyncHandler =
    (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
    };

  const extractCookie = (req: Request, name: string): string | undefined => {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      if (k === name) {
        try {
          return decodeURIComponent(part.slice(eq + 1).trim());
        } catch {
          return part.slice(eq + 1).trim();
        }
      }
    }
    return undefined;
  };

  const extractToken = (req: Request): string | undefined => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const t = authHeader.slice(7).trim();
      if (t) return t;
    }
    const altHeader = req.headers['x-depotpro-token'];
    if (typeof altHeader === 'string' && altHeader.trim()) {
      return altHeader.trim();
    }
    return extractCookie(req, 'depotpro_session');
  };

  const isHttpsRequest = (req: Request): boolean => {
    const proto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    return req.secure || proto === 'https';
  };

  const setSessionCookie = (req: Request, res: Response, token: string): void => {
    const secure = isHttpsRequest(req);
    const attrs = [
      `depotpro_session=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  };

  const clearSessionCookie = (req: Request, res: Response): void => {
    const secure = isHttpsRequest(req);
    const attrs = [
      'depotpro_session=',
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!verifyToken(token)) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session verrouillée ou expirée.' });
      return;
    }
    next();
  };

  // Routes Auth publiques
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/status', (req, res) => {
    const status = getAuthStatus();
    const authenticated = verifyToken(extractToken(req));
    res.json({ ...status, authenticated });
  });
  app.post(
    '/api/auth/setup',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const result = await setupOwnerPin(String(req.body?.pin ?? ''));
      setSessionCookie(req, res, result.token);
      res.json(result);
    })
  );
  app.post(
    '/api/auth/login',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const result = await loginOwner(String(req.body?.pin ?? ''));
      setSessionCookie(req, res, result.token);
      res.json(result);
    })
  );
  app.post('/api/auth/lock', (req, res) => {
    const token = extractToken(req);
    revokeToken(token);
    clearSessionCookie(req, res);
    res.json({ locked: true });
  });

  // Routes protégées par session PIN
  app.use('/api', requireAuth);

  app.post(
    '/api/auth/change-pin',
    authRateLimit,
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
    '/api/clients/:id',
    asyncHandler(async (req, res) => res.json(await updateClient(Number(req.params.id), req.body)))
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
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
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
  app.put(
    '/api/suppliers/:id',
    asyncHandler(async (req, res) => res.json(await updateSupplier(Number(req.params.id), req.body)))
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
  app.post(
    '/api/purchases/:id/cancel',
    asyncHandler(async (req, res) =>
      res.json(await cancelPurchaseOrder(Number(req.params.id), req.body))
    )
  );
  app.get('/api/supplier-debts', (_req, res) => res.json(listSupplierDebts()));
  app.post(
    '/api/supplier-debts/:id/pay',
    asyncHandler(async (req, res) => res.json(await paySupplierDebt(Number(req.params.id), req.body)))
  );

  // Stocks & Inventaires
  app.get('/api/stock', (_req, res) => res.json(getStockOverview()));
  app.post(
    '/api/stock/adjust',
    asyncHandler(async (req, res) => res.status(201).json(await adjustStock(req.body)))
  );
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

  app.post(
    '/api/documents/pdf',
    asyncHandler(async (req, res) => {
      const { filename, buffer } = generateDocumentPdf(req.body);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    })
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
    if (msg.includes('SQLITE_BUSY') || msg.toLowerCase().includes('database is locked')) {
      res.status(503).json({
        code: 'DATABASE_BUSY',
        message: 'Base de données temporairement occupée par une autre opération (SQLITE_BUSY). Réessayez dans un instant.',
      });
      return;
    }
    if (msg.includes('SQLITE_CONSTRAINT')) {
      res.status(409).json({ code: 'VALIDATION_ERROR', message: 'Contrainte d’intégrité ou doublon détecté.' });
      return;
    }
    console.error('[DEPOTPRO API ERROR]', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Une erreur serveur est survenue.' });
  });

  return app;
}
