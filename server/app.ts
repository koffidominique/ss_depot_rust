import express, { type Request, type Response, type NextFunction } from 'express';
import { BusinessError } from './domain.ts';
import { getDb, runWithActor } from './db.ts';
import {
  getAuthStatus,
  setupOwnerPin,
  loginUser,
  changeOwnerPin,
  listUsers,
  createUser,
  setUserActive,
  verifyTokenAndTouch,
  verifyToken,
  revokeToken,
  requirePermission,
  type Permission,
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
  listCatalogPresets,
  applyCatalogPresets,
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
  createEncryptedBackup,
  listBackups,
  readBackupFile,
  verifyBackup,
  verifyEncryptedBackup,
  restoreBackup,
  restoreEncryptedBackup,
} from './services/reports.ts';
import { generateDocumentPdf } from './services/pdf.ts';

function parseStrictOrigin(raw: string): URL | null {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.includes('@') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.includes('\\')
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.origin !== trimmed) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedHttpOrigin(
  origin: string,
  hostHeader: string,
  forwardedHostHeader: string | undefined,
  trustProxy: boolean,
  extraAllowedRaw: string
): boolean {
  const parsedOrigin = parseStrictOrigin(origin);
  if (!parsedOrigin) return false;

  const hostLower = parsedOrigin.hostname.toLowerCase();
  if (hostLower === 'localhost' || hostLower === '127.0.0.1' || hostLower === '[::1]') {
    return true;
  }

  if (trustProxy) {
    const candidateHost = (forwardedHostHeader || '').split(',')[0].trim() || hostHeader.trim();
    if (candidateHost) {
      const candidateUrl = parseStrictOrigin(`${parsedOrigin.protocol}//${candidateHost}`);
      if (candidateUrl && candidateUrl.origin === parsedOrigin.origin) {
        return true;
      }
    }
  }

  const extraPatterns = extraAllowedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const pattern of extraPatterns) {
    if (pattern.startsWith('https://*.') || pattern.startsWith('http://*.')) {
      const [scheme, rest] = pattern.split('://*.');
      if (
        rest &&
        parsedOrigin.protocol === `${scheme.toLowerCase()}:` &&
        (hostLower === rest.toLowerCase() || hostLower.endsWith(`.${rest.toLowerCase()}`))
      ) {
        return true;
      }
      continue;
    }
    const allowedParsed = parseStrictOrigin(pattern);
    if (allowedParsed && allowedParsed.origin === parsedOrigin.origin) {
      return true;
    }
  }

  return false;
}

export function createApiApp() {
  const app = express();
  const trustProxy = process.env.DEPOTPRO_TRUST_PROXY === 'true' || process.env.DEPOTPRO_TRUST_PROXY === '1';
  app.set('trust proxy', trustProxy ? 1 : false);
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
      const forwardedHost =
        trustProxy && typeof req.headers['x-forwarded-host'] === 'string'
          ? req.headers['x-forwarded-host']
          : undefined;
      const isAllowed = isAllowedHttpOrigin(
        origin,
        host,
        forwardedHost,
        trustProxy,
        process.env.DEPOTPRO_ALLOWED_ORIGINS || ''
      );
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
    const clientIp = req.ip || req.socket.remoteAddress || 'local';
    const key = `${clientIp}:${req.path}`;
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
    const proto = trustProxy
      ? String(req.headers['x-forwarded-proto'] || '')
          .split(',')[0]
          .trim()
          .toLowerCase()
      : '';
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

  const withPerm =
    (
      perm: Permission | null,
      fn: (req: Request, res: Response) => Promise<unknown> | unknown
    ) =>
    (req: Request, res: Response, next: NextFunction) => {
      const token = extractToken(req);
      const actor = verifyTokenAndTouch(token);
      if (!actor) {
        res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session verrouillée ou expirée.' });
        return;
      }
      try {
        if (perm) requirePermission(actor, perm);
      } catch (err) {
        next(err);
        return;
      }
      runWithActor(actor, () => {
        Promise.resolve(fn(req, res)).catch(next);
      });
    };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    const actor = verifyTokenAndTouch(token);
    if (!actor) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session verrouillée ou expirée.' });
      return;
    }
    runWithActor(actor, () => next());
  };

  // Routes Auth publiques
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/status', (req, res) => {
    const status = getAuthStatus();
    const actor = verifyTokenAndTouch(extractToken(req));
    const authenticated = actor !== null;
    res.json({ ...status, authenticated, user: actor ?? undefined });
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
      const username = req.body?.username !== undefined ? String(req.body.username) : undefined;
      const result = await loginUser(username, String(req.body?.pin ?? ''));
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

  // Routes protégées par session & RBAC
  app.use('/api', requireAuth);

  app.get(
    '/api/auth/me',
    withPerm(null, (req, res) => {
      const actor = verifyTokenAndTouch(extractToken(req));
      if (!actor || !verifyToken(extractToken(req))) {
        res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session verrouillée ou expirée.' });
        return;
      }
      res.json({ user: actor });
    })
  );

  app.post(
    '/api/auth/change-pin',
    authRateLimit,
    withPerm('security:change_owner_pin', async (req, res) => {
      await changeOwnerPin(
        String(req.body?.currentPin ?? ''),
        String(req.body?.newPin ?? ''),
        extractToken(req)
      );
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/auth/users',
    withPerm('security:manage_users', (_req, res) => res.json(listUsers()))
  );
  app.post(
    '/api/auth/users',
    withPerm('security:manage_users', async (req, res) => {
      const user = await createUser({
        username: String(req.body?.username ?? ''),
        displayName: String(req.body?.displayName ?? ''),
        role: String(req.body?.role ?? ''),
        pin: String(req.body?.pin ?? ''),
      });
      res.status(201).json(user);
    })
  );
  app.put(
    '/api/auth/users/:id/status',
    withPerm('security:manage_users', async (req, res) => {
      const user = await setUserActive(Number(req.params.id), Boolean(req.body?.active));
      res.json(user);
    })
  );

  // Dashboard
  app.get(
    '/api/dashboard',
    withPerm('catalog:read', (_req, res) => res.json(getDashboardData()))
  );

  // Catégories & Produits
  app.get(
    '/api/categories',
    withPerm('catalog:read', (_req, res) => res.json(listCategories()))
  );
  app.post(
    '/api/categories',
    withPerm('catalog:write', async (req, res) =>
      res.status(201).json(await createCategory(req.body?.name, req.body?.description))
    )
  );

  app.get(
    '/api/products',
    withPerm('catalog:read', (req, res) => {
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
    })
  );
  app.get(
    '/api/products/export/csv',
    withPerm('catalog:read', (_req, res) => {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="depotpro_produits.csv"');
      res.send(exportProductsCsv());
    })
  );
  app.post(
    '/api/products/import/csv',
    withPerm('catalog:write', async (req, res) =>
      res.json(await importProductsCsv(String(req.body?.csv ?? '')))
    )
  );
  app.get(
    '/api/products/presets',
    withPerm('catalog:read', (_req, res) => res.json(listCatalogPresets()))
  );
  app.post(
    '/api/products/presets/apply',
    withPerm('catalog:write', async (req, res) => res.json(await applyCatalogPresets(req.body)))
  );
  app.post(
    '/api/products',
    withPerm('catalog:write', async (req, res) => res.status(201).json(await createProduct(req.body)))
  );
  app.put(
    '/api/products/:id',
    withPerm('catalog:write', async (req, res) =>
      res.json(await updateProduct(Number(req.params.id), req.body))
    )
  );
  app.post(
    '/api/products/:id/packagings',
    withPerm('catalog:write', async (req, res) =>
      res.json(await addOrUpdatePackaging(Number(req.params.id), req.body))
    )
  );

  // Clients & Crédit
  app.get(
    '/api/clients',
    withPerm('sales:read', (req, res) =>
      res.json(listClients(req.query.search ? String(req.query.search) : undefined))
    )
  );
  app.post(
    '/api/clients',
    withPerm('sales:write', async (req, res) => res.status(201).json(await createClient(req.body)))
  );
  app.put(
    '/api/clients/:id',
    withPerm('sales:write', async (req, res) =>
      res.json(await updateClient(Number(req.params.id), req.body))
    )
  );
  app.put(
    '/api/clients/:id/credit',
    withPerm('sales:write', async (req, res) =>
      res.json(await updateClientCreditPolicy(Number(req.params.id), req.body))
    )
  );

  // Ventes, Annulations & Retours
  app.get(
    '/api/sales',
    withPerm('sales:read', (req, res) => {
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
    })
  );
  app.get(
    '/api/sales/:id',
    withPerm('sales:read', (req, res) => res.json(getSaleDetail(Number(req.params.id))))
  );
  app.post(
    '/api/sales',
    withPerm('sales:write', async (req, res) => res.status(201).json(await createSale(req.body)))
  );
  app.post(
    '/api/sales/:id/cancel',
    withPerm('sales:cancel_return', async (req, res) =>
      res.json(await cancelSale(Number(req.params.id), req.body))
    )
  );
  app.post(
    '/api/sales/:id/returns',
    withPerm('sales:cancel_return', async (req, res) =>
      res.status(201).json(await createSaleReturn(Number(req.params.id), req.body))
    )
  );

  // Créances
  app.get(
    '/api/receivables',
    withPerm('receivables:read', (_req, res) => res.json(listReceivables()))
  );
  app.post(
    '/api/receivables/:id/pay',
    withPerm('receivables:pay', async (req, res) =>
      res.json(await payReceivable(Number(req.params.id), req.body))
    )
  );

  // Fournisseurs & Approvisionnements
  app.get(
    '/api/suppliers',
    withPerm('purchases:read', (req, res) =>
      res.json(listSuppliers(req.query.search ? String(req.query.search) : undefined))
    )
  );
  app.post(
    '/api/suppliers',
    withPerm('purchases:write', async (req, res) =>
      res.status(201).json(await createSupplier(req.body))
    )
  );
  app.put(
    '/api/suppliers/:id',
    withPerm('purchases:write', async (req, res) =>
      res.json(await updateSupplier(Number(req.params.id), req.body))
    )
  );
  app.get(
    '/api/purchases',
    withPerm('purchases:read', (_req, res) => res.json(listPurchaseOrders()))
  );
  app.post(
    '/api/purchases',
    withPerm('purchases:write', async (req, res) =>
      res.status(201).json(await createPurchaseOrder(req.body))
    )
  );
  app.post(
    '/api/purchases/:id/receive',
    withPerm('purchases:write', async (req, res) =>
      res.status(201).json(await receivePurchaseOrder(Number(req.params.id), req.body))
    )
  );
  app.post(
    '/api/purchases/:id/cancel',
    withPerm('purchases:write', async (req, res) =>
      res.json(await cancelPurchaseOrder(Number(req.params.id), req.body))
    )
  );
  app.get(
    '/api/supplier-debts',
    withPerm('purchases:read', (_req, res) => res.json(listSupplierDebts()))
  );
  app.post(
    '/api/supplier-debts/:id/pay',
    withPerm('supplier_debts:pay', async (req, res) =>
      res.json(await paySupplierDebt(Number(req.params.id), req.body))
    )
  );

  // Stocks & Inventaires
  app.get(
    '/api/stock',
    withPerm('stock:read', (_req, res) => res.json(getStockOverview()))
  );
  app.post(
    '/api/stock/adjust',
    withPerm('stock:adjust', async (req, res) => res.status(201).json(await adjustStock(req.body)))
  );
  app.get(
    '/api/inventories',
    withPerm('stock:read', (_req, res) => res.json(listInventories()))
  );
  app.post(
    '/api/inventories',
    withPerm('inventory:validate', async (req, res) =>
      res.status(201).json(await createInventory(req.body?.notes))
    )
  );
  app.post(
    '/api/inventories/:id/validate',
    withPerm('inventory:validate', async (req, res) =>
      res.json(await validateInventory(Number(req.params.id), req.body?.lines || []))
    )
  );

  // Consignations
  app.get(
    '/api/consignments',
    withPerm('consignments:read', (_req, res) => res.json(getConsignmentsOverview()))
  );
  app.post(
    '/api/consignments/types',
    withPerm('consignments:write', async (req, res) =>
      res.status(201).json(await createReturnableType(req.body))
    )
  );
  app.post(
    '/api/consignments/stock-movements',
    withPerm('consignments:write', async (req, res) =>
      res.status(201).json(await adjustReturnableStock(req.body))
    )
  );
  app.post(
    '/api/consignments/returns',
    withPerm('consignments:write', async (req, res) =>
      res.status(201).json(await returnClientEmpties(req.body))
    )
  );

  // Caisse & Dépenses
  app.get(
    '/api/cash',
    withPerm('cash:read', (_req, res) => res.json(getCashStatus()))
  );
  app.post(
    '/api/cash/open',
    withPerm('cash:operate', async (req, res) =>
      res.status(201).json(await openCashSession(req.body))
    )
  );
  app.post(
    '/api/cash/close',
    withPerm('cash:operate', async (req, res) => res.json(await closeCashSession(req.body)))
  );
  app.get(
    '/api/expenses',
    withPerm('cash:read', (_req, res) => res.json(listExpenses()))
  );
  app.post(
    '/api/expenses',
    withPerm('expenses:write', async (req, res) =>
      res.status(201).json(await createExpense(req.body))
    )
  );

  // Rapports & Paramètres & Sauvegardes
  app.get(
    '/api/reports',
    withPerm('reports:read', (req, res) =>
      res.json(
        getReportsOverview(
          req.query.from ? String(req.query.from) : undefined,
          req.query.to ? String(req.query.to) : undefined
        )
      )
    )
  );
  app.get(
    '/api/settings',
    withPerm('settings:read', (_req, res) => res.json(getSettings()))
  );
  app.put(
    '/api/settings',
    withPerm('settings:write', async (req, res) => res.json(await updateSettings(req.body)))
  );
  app.post(
    '/api/payment-methods',
    withPerm('settings:write', async (req, res) =>
      res.status(201).json(await addPaymentMethod(req.body?.label))
    )
  );
  app.put(
    '/api/payment-methods/:code',
    withPerm('settings:write', async (req, res) =>
      res.json(await togglePaymentMethod(req.params.code, Boolean(req.body?.active)))
    )
  );

  app.post(
    '/api/documents/pdf',
    (req, res, next) => {
      const docType = String(req.body?.docType ?? '');
      const needed: Permission =
        docType === 'BON_COMMANDE' || docType === 'BON_RECEPTION'
          ? 'purchases:read'
          : docType === 'CLOTURE_CAISSE'
            ? 'cash:read'
            : 'sales:read';
      withPerm(needed, (_r, r2) => {
        const { filename, buffer } = generateDocumentPdf(req.body);
        r2.setHeader('Content-Type', 'application/pdf');
        r2.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        r2.send(buffer);
      })(req, res, next);
    }
  );

  app.get(
    '/api/backups',
    withPerm('backups:read', (_req, res) => res.json(listBackups()))
  );
  app.post(
    '/api/backups',
    withPerm('backups:create', async (_req, res) => res.status(201).json(await createBackup()))
  );
  app.post(
    '/api/backups/encrypted',
    withPerm('backups:create', async (req, res) =>
      res.status(201).json(await createEncryptedBackup(String(req.body?.passphrase ?? '')))
    )
  );
  app.get(
    '/api/backups/:name/verify',
    withPerm('backups:read', (req, res) => res.json(verifyBackup(req.params.name)))
  );
  app.post(
    '/api/backups/:name/verify-encrypted',
    withPerm('backups:read', (req, res) =>
      res.json(verifyEncryptedBackup(req.params.name, String(req.body?.passphrase ?? '')))
    )
  );
  app.get(
    '/api/backups/:name/download',
    withPerm('backups:read', (req, res) => {
      const { safeName, fullPath } = readBackupFile(req.params.name);
      res.download(fullPath, safeName);
    })
  );
  app.post(
    '/api/backups/:name/restore',
    withPerm('backups:restore', async (req, res) => res.json(await restoreBackup(req.params.name)))
  );
  app.post(
    '/api/backups/:name/restore-encrypted',
    withPerm('backups:restore', async (req, res) =>
      res.json(
        await restoreEncryptedBackup(req.params.name, String(req.body?.passphrase ?? ''))
      )
    )
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
