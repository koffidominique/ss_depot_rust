import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { getDb, withWriteTx, nextSequence, auditLog } from '../db.ts';
import { requireCurrentActorPermission } from './auth.ts';
import {
  BusinessError,
  nonNegativeFcfa,
  nonNegativeMilli,
  positiveMilli,
  formatMilli,
} from '../domain.ts';

export interface ProductFilter {
  search?: string;
  categoryId?: number;
  includeArchived?: boolean;
  lowStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export function listCategories() {
  requireCurrentActorPermission('catalog:read');
  const db = getDb();
  return db.prepare('SELECT id, name, description, is_active FROM categories ORDER BY name').all();
}

export async function createCategory(name: string, description?: string) {
  requireCurrentActorPermission('catalog:write');
  const clean = (name || '').trim();
  if (!clean) throw new BusinessError('VALIDATION_ERROR', 'Le nom de la catégorie est obligatoire.');
  return withWriteTx((db) => {
    const dup = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(clean);
    if (dup) throw new BusinessError('DUPLICATE_OPERATION', 'Cette catégorie existe déjà.');
    const res = db
      .prepare('INSERT INTO categories (name, description) VALUES (?, ?)')
      .run(clean, description?.trim() || null);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(res.lastInsertRowid));
  });
}

function computeAvgCostFcfa(
  avgNum: unknown,
  avgDen: unknown
): number | null {
  if (!avgNum || !avgDen) return null;
  const num = BigInt(String(avgNum));
  const den = BigInt(String(avgDen));
  if (den <= 0n) return null;
  const rounded = (num + den / 2n) / den;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return rounded <= maxSafe && rounded >= -maxSafe ? Number(rounded) : null;
}

function enrichPackagingRow(db: DatabaseSync, pk: Record<string, unknown>) {
  const components = db
    .prepare(
      `SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.code, rpt.name, rpt.deposit_value, rpt.kind
       FROM deposit_packaging_components dpc
       JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
       WHERE dpc.packaging_id = ?`
    )
    .all(Number(pk.id));
  return {
    ...pk,
    components,
  };
}

function getPackagingById(db: DatabaseSync, pkgId: number) {
  const pk = db
    .prepare(
      `SELECT pk.*, dp.mode AS deposit_mode
       FROM product_packagings pk
       LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
       WHERE pk.id = ?`
    )
    .get(pkgId) as Record<string, unknown> | undefined;
  return pk ? enrichPackagingRow(db, pk) : undefined;
}

function getProductById(db: DatabaseSync, productId: number) {
  const p = db
    .prepare(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ?`
    )
    .get(productId) as Record<string, unknown> | undefined;
  if (!p) return undefined;
  const pks = db
    .prepare(
      `SELECT pk.*, dp.mode AS deposit_mode
       FROM product_packagings pk
       LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
       WHERE pk.product_id = ?
       ORDER BY pk.coefficient_milli ASC`
    )
    .all(productId) as Array<Record<string, unknown>>;
  return {
    ...p,
    average_cost_fcfa: computeAvgCostFcfa(p.average_cost_num, p.average_cost_den),
    packagings: pks.map((pk) => enrichPackagingRow(db, pk)),
  };
}

export function listProducts(filter: ProductFilter = {}) {
  requireCurrentActorPermission('catalog:read');
  const db = getDb();
  const page = Math.max(1, Number(filter.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize || 25)));
  const offset = (page - 1) * pageSize;

  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (!filter.includeArchived) {
    clauses.push('p.is_active = 1');
  }
  if (filter.categoryId) {
    clauses.push('p.category_id = ?');
    params.push(Number(filter.categoryId));
  }
  if (filter.lowStockOnly) {
    clauses.push('p.stock_milli <= p.min_stock_milli');
  }
  if (filter.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`;
    clauses.push(
      '(p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, \'\') LIKE ? OR COALESCE(p.brand, \'\') LIKE ? OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?))'
    );
    params.push(q, q, q, q, q);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM products p ${where}`)
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${where}
       ORDER BY p.is_active DESC, p.name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  const pkgStmt = db.prepare(
    `SELECT pk.*, dp.mode AS deposit_mode
     FROM product_packagings pk
     LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
     WHERE pk.product_id = ?
     ORDER BY pk.coefficient_milli ASC`
  );
  const compStmt = db.prepare(
    `SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.code, rpt.name, rpt.deposit_value, rpt.kind
     FROM deposit_packaging_components dpc
     JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
     WHERE dpc.packaging_id = ?`
  );

  const enriched = items.map((p) => {
    const packagings = (pkgStmt.all(Number(p.id)) as Array<Record<string, unknown>>).map((pk) => ({
      ...pk,
      components: compStmt.all(Number(pk.id)),
    }));
    return {
      ...p,
      average_cost_fcfa: computeAvgCostFcfa(p.average_cost_num, p.average_cost_den),
      packagings,
    };
  });

  return {
    items: enriched,
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRow.total / pageSize)),
  };
}

export interface CreateProductInput {
  name: string;
  brand?: string;
  barcode?: string;
  category_id: number;
  supplier_id?: number | null;
  description?: string;
  base_unit: string;
  initial_stock?: string | number;
  min_stock?: string | number;
  max_stock?: string | number;
  purchase_price?: number | null;
  wholesale_price?: number | null;
  semi_wholesale_price?: number | null;
  retail_price?: number | null;
  image_path?: string | null;
  is_active?: boolean;
  packagings?: Array<{
    name: 'casier' | 'carton' | 'bouteille' | 'pack' | 'canette';
    coefficient: string | number;
    purchase_price?: number | null;
    wholesale_price?: number | null;
    semi_wholesale_price?: number | null;
    retail_price?: number | null;
    barcode?: string | null;
    allow_fraction?: boolean;
    deposit_mode?: 'none' | 'deposit';
    components?: Array<{ returnable_id: number; pieces_per_pack: number }>;
  }>;
}

const ALLOWED_PACKAGING_NAMES = new Set(['casier', 'carton', 'bouteille', 'pack', 'canette']);

export function sanitizeImagePath(raw?: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 350_000) {
    throw new BusinessError('VALIDATION_ERROR', "L'image est trop volumineuse (max 250 Ko).");
  }
  const isSafeDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
  const isSafeRelPath = /^\/images\/[a-zA-Z0-9._/-]+$/.test(trimmed) && !trimmed.includes('..');
  if (!isSafeDataUri && !isSafeRelPath) {
    throw new BusinessError(
      'VALIDATION_ERROR',
      "Format d'image invalide (utilisez PNG, JPEG ou WebP local)."
    );
  }
  return trimmed;
}

export async function createProduct(input: CreateProductInput) {
  requireCurrentActorPermission('catalog:write');
  const name = (input.name || '').trim();
  const baseUnit = (input.base_unit || 'bouteille').trim();
  if (!name) throw new BusinessError('VALIDATION_ERROR', 'Le nom du produit est obligatoire.');
  if (!baseUnit) throw new BusinessError('VALIDATION_ERROR', "L'unité de base est obligatoire.");

  const initialStockMilli = nonNegativeMilli(input.initial_stock ?? 0, 'Stock initial');
  const minStockMilli = nonNegativeMilli(input.min_stock ?? 0, 'Stock minimum');
  const maxStockMilli = nonNegativeMilli(input.max_stock ?? 0, 'Stock maximum');
  const purchasePrice =
    input.purchase_price !== null && input.purchase_price !== undefined
      ? nonNegativeFcfa(input.purchase_price, "Prix d'achat")
      : null;
  const wholesalePrice =
    input.wholesale_price !== null && input.wholesale_price !== undefined
      ? nonNegativeFcfa(input.wholesale_price, 'Prix gros')
      : null;
  const semiPrice =
    input.semi_wholesale_price !== null && input.semi_wholesale_price !== undefined
      ? nonNegativeFcfa(input.semi_wholesale_price, 'Prix demi-gros')
      : null;
  const retailPrice =
    input.retail_price !== null && input.retail_price !== undefined
      ? nonNegativeFcfa(input.retail_price, 'Prix détail')
      : null;
  const imagePath = sanitizeImagePath(input.image_path);

  return withWriteTx((db) => {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(input.category_id);
    if (!cat) throw new BusinessError('VALIDATION_ERROR', 'Catégorie introuvable.');
    if (input.supplier_id) {
      const sup = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(input.supplier_id);
      if (!sup) throw new BusinessError('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable.');
    }
    const cleanBarcode = input.barcode?.trim() || null;
    if (cleanBarcode) {
      const dupBarcode = db
        .prepare(
          'SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?'
        )
        .get(cleanBarcode, cleanBarcode);
      if (dupBarcode) throw new BusinessError('DUPLICATE_OPERATION', 'Ce code-barres est déjà utilisé.');
    }

    const reference = nextSequence(db, 'PROD');
    const avgNum = purchasePrice !== null ? String(purchasePrice) : null;
    const avgDen = purchasePrice !== null ? '1' : null;
    const isActive = input.is_active === undefined ? 1 : input.is_active ? 1 : 0;

    const prodRes = db
      .prepare(
        `INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, description, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reference,
        cleanBarcode,
        name,
        input.brand?.trim() || null,
        input.category_id,
        input.supplier_id ?? null,
        input.description?.trim() || null,
        baseUnit,
        initialStockMilli,
        minStockMilli,
        maxStockMilli,
        avgNum,
        avgDen,
        purchasePrice,
        wholesalePrice,
        semiPrice,
        retailPrice,
        imagePath,
        isActive
      );

    const productId = Number(prodRes.lastInsertRowid);

    if (initialStockMilli > 0) {
      db.prepare(
        `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
         VALUES (?, 'manual_adjust', ?, 0, ?, ?, 'Stock initial à la création', ?)`
      ).run(productId, initialStockMilli, initialStockMilli, purchasePrice, reference);
    }

    const packagings = input.packagings?.length
      ? input.packagings
      : [
          {
            name: (ALLOWED_PACKAGING_NAMES.has(baseUnit) ? baseUnit : 'bouteille') as
              | 'casier'
              | 'carton'
              | 'bouteille'
              | 'pack'
              | 'canette',
            coefficient: 1,
            purchase_price: purchasePrice,
            wholesale_price: wholesalePrice,
            semi_wholesale_price: semiPrice,
            retail_price: retailPrice,
            allow_fraction: false,
            deposit_mode: 'none' as const,
          },
        ];

    const seenPkgNames = new Set<string>();
    for (const pkg of packagings) {
      if (!ALLOWED_PACKAGING_NAMES.has(pkg.name)) {
        throw new BusinessError('INVALID_PACKAGING', `Conditionnement non autorisé : ${pkg.name}`);
      }
      if (seenPkgNames.has(pkg.name)) {
        throw new BusinessError(
          'DUPLICATE_OPERATION',
          `Conditionnement "${pkg.name}" dupliqué sur le même produit.`
        );
      }
      seenPkgNames.add(pkg.name);
      const coeffMilli = positiveMilli(pkg.coefficient, `Coefficient (${pkg.name})`);
      const pkgPurchase =
        pkg.purchase_price !== null && pkg.purchase_price !== undefined
          ? nonNegativeFcfa(pkg.purchase_price, `Prix d'achat (${pkg.name})`)
          : null;
      const pkgWholesale =
        pkg.wholesale_price !== null && pkg.wholesale_price !== undefined
          ? nonNegativeFcfa(pkg.wholesale_price, `Prix gros (${pkg.name})`)
          : null;
      const pkgSemi =
        pkg.semi_wholesale_price !== null && pkg.semi_wholesale_price !== undefined
          ? nonNegativeFcfa(pkg.semi_wholesale_price, `Prix demi-gros (${pkg.name})`)
          : null;
      const pkgRetail =
        pkg.retail_price !== null && pkg.retail_price !== undefined
          ? nonNegativeFcfa(pkg.retail_price, `Prix détail (${pkg.name})`)
          : null;
      const pkgBarcode = pkg.barcode?.trim() || null;
      if (pkgBarcode) {
        const dup = db
          .prepare(
            'SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?'
          )
          .get(pkgBarcode, pkgBarcode);
        if (dup) throw new BusinessError('DUPLICATE_OPERATION', `Code-barres déjà utilisé : ${pkgBarcode}`);
      }

      const pkgRes = db
        .prepare(
          `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          productId,
          pkg.name,
          baseUnit,
          coeffMilli,
          pkgPurchase,
          pkgWholesale,
          pkgSemi,
          pkgRetail,
          pkgBarcode,
          pkg.allow_fraction ? 1 : 0
        );
      const pkgId = Number(pkgRes.lastInsertRowid);
      const mode = pkg.deposit_mode === 'deposit' ? 'deposit' : 'none';
      db.prepare('INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)').run(
        pkgId,
        mode
      );
      if (mode === 'deposit' && pkg.components?.length) {
        for (const comp of pkg.components) {
          if (!Number.isInteger(comp.pieces_per_pack) || comp.pieces_per_pack <= 0) {
            throw new BusinessError('VALIDATION_ERROR', 'Nombre de pièces par conditionnement invalide.');
          }
          const rtExists = db
            .prepare('SELECT id FROM returnable_packaging_types WHERE id = ?')
            .get(comp.returnable_id);
          if (!rtExists) {
            throw new BusinessError('VALIDATION_ERROR', "Type d'emballage consigné introuvable.");
          }
          db.prepare(
            'INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)'
          ).run(pkgId, comp.returnable_id, comp.pieces_per_pack);
        }
      }
    }

    auditLog(db, 'CREATE_PRODUCT', 'products', productId, `Création produit ${reference} — ${name}`);
    return getProductById(db, productId);
  });
}

export async function updateProduct(
  id: number,
  input: Partial<CreateProductInput> & { is_active?: boolean }
) {
  requireCurrentActorPermission('catalog:write');
  return withWriteTx((db) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new BusinessError('PRODUCT_NOT_FOUND', 'Produit introuvable.', 404);

    const name = input.name !== undefined ? input.name.trim() : String(existing.name);
    if (!name) throw new BusinessError('VALIDATION_ERROR', 'Nom produit invalide.');

    if (input.category_id !== undefined) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(input.category_id));
      if (!cat) throw new BusinessError('VALIDATION_ERROR', 'Catégorie introuvable.');
    }
    if (input.supplier_id !== undefined && input.supplier_id !== null) {
      const sup = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(Number(input.supplier_id));
      if (!sup) throw new BusinessError('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable.');
    }

    const cleanBarcode =
      input.barcode !== undefined ? input.barcode?.trim() || null : (existing.barcode as string | null);
    if (cleanBarcode) {
      const dup = db
        .prepare(
          'SELECT id FROM products WHERE barcode = ? AND id != ? UNION SELECT id FROM product_packagings WHERE barcode = ?'
        )
        .get(cleanBarcode, id, cleanBarcode);
      if (dup) throw new BusinessError('DUPLICATE_OPERATION', 'Code-barres déjà utilisé.');
    }

    const minStockMilli =
      input.min_stock !== undefined
        ? nonNegativeMilli(input.min_stock, 'Stock minimum')
        : Number(existing.min_stock_milli);
    const maxStockMilli =
      input.max_stock !== undefined
        ? nonNegativeMilli(input.max_stock, 'Stock maximum')
        : Number(existing.max_stock_milli);

    const wholesalePrice =
      input.wholesale_price !== undefined
        ? input.wholesale_price === null
          ? null
          : nonNegativeFcfa(input.wholesale_price, 'Prix gros')
        : (existing.wholesale_price as number | null);
    const semiPrice =
      input.semi_wholesale_price !== undefined
        ? input.semi_wholesale_price === null
          ? null
          : nonNegativeFcfa(input.semi_wholesale_price, 'Prix demi-gros')
        : (existing.semi_wholesale_price as number | null);
    const retailPrice =
      input.retail_price !== undefined
        ? input.retail_price === null
          ? null
          : nonNegativeFcfa(input.retail_price, 'Prix détail')
        : (existing.retail_price as number | null);
    const purchasePrice =
      input.purchase_price !== undefined
        ? input.purchase_price === null
          ? null
          : nonNegativeFcfa(input.purchase_price, "Prix d'achat")
        : (existing.purchase_price as number | null);

    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : Number(existing.is_active);
    const imagePath =
      input.image_path !== undefined
        ? sanitizeImagePath(input.image_path)
        : (existing.image_path as string | null);

    db.prepare(
      `UPDATE products
       SET name = ?, brand = ?, barcode = ?, category_id = ?, supplier_id = ?, description = ?,
           min_stock_milli = ?, max_stock_milli = ?, purchase_price = ?, wholesale_price = ?,
           semi_wholesale_price = ?, retail_price = ?, image_path = ?, is_active = ?
       WHERE id = ?`
    ).run(
      name,
      input.brand !== undefined ? input.brand?.trim() || null : (existing.brand as string | null),
      cleanBarcode,
      Number(input.category_id ?? existing.category_id),
      input.supplier_id !== undefined ? input.supplier_id : (existing.supplier_id as number | null),
      input.description !== undefined ? input.description?.trim() || null : (existing.description as string | null),
      minStockMilli,
      maxStockMilli,
      purchasePrice,
      wholesalePrice,
      semiPrice,
      retailPrice,
      imagePath,
      isActive,
      id
    );

    auditLog(db, 'UPDATE_PRODUCT', 'products', id, `Mise à jour produit ${existing.reference}`);
    return getProductById(db, id);
  });
}

export async function addOrUpdatePackaging(
  productId: number,
  pkg: {
    id?: number;
    name: 'casier' | 'carton' | 'bouteille' | 'pack' | 'canette';
    coefficient: string | number;
    purchase_price?: number | null;
    wholesale_price?: number | null;
    semi_wholesale_price?: number | null;
    retail_price?: number | null;
    barcode?: string | null;
    allow_fraction?: boolean;
    is_active?: boolean;
    deposit_mode?: 'none' | 'deposit';
    components?: Array<{ returnable_id: number; pieces_per_pack: number }>;
  }
) {
  if (!ALLOWED_PACKAGING_NAMES.has(pkg.name)) {
    throw new BusinessError('INVALID_PACKAGING', 'Type de conditionnement invalide.');
  }
  requireCurrentActorPermission('catalog:write');
  const coeffMilli = positiveMilli(pkg.coefficient, 'Coefficient');
  const pkgPurchase =
    pkg.purchase_price !== null && pkg.purchase_price !== undefined
      ? nonNegativeFcfa(pkg.purchase_price, "Prix d'achat (conditionnement)")
      : null;
  const pkgWholesale =
    pkg.wholesale_price !== null && pkg.wholesale_price !== undefined
      ? nonNegativeFcfa(pkg.wholesale_price, 'Prix gros (conditionnement)')
      : null;
  const pkgSemi =
    pkg.semi_wholesale_price !== null && pkg.semi_wholesale_price !== undefined
      ? nonNegativeFcfa(pkg.semi_wholesale_price, 'Prix demi-gros (conditionnement)')
      : null;
  const pkgRetail =
    pkg.retail_price !== null && pkg.retail_price !== undefined
      ? nonNegativeFcfa(pkg.retail_price, 'Prix détail (conditionnement)')
      : null;

  return withWriteTx((db) => {
    const prod = db.prepare('SELECT id, base_unit FROM products WHERE id = ?').get(productId) as
      | { id: number; base_unit: string }
      | undefined;
    if (!prod) throw new BusinessError('PRODUCT_NOT_FOUND', 'Produit introuvable.', 404);

    const barcode = pkg.barcode?.trim() || null;
    if (barcode) {
      const dup = db
        .prepare(
          'SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ? AND id != ?'
        )
        .get(barcode, barcode, pkg.id ?? -1);
      if (dup) throw new BusinessError('DUPLICATE_OPERATION', 'Code-barres déjà utilisé.');
    }

    const dupName = db
      .prepare('SELECT id FROM product_packagings WHERE product_id = ? AND name = ? AND id != ?')
      .get(productId, pkg.name, pkg.id ?? -1);
    if (dupName) {
      throw new BusinessError(
        'DUPLICATE_OPERATION',
        `Un conditionnement "${pkg.name}" existe déjà pour ce produit. Sélectionnez-le pour le modifier.`
      );
    }

    let pkgId = pkg.id;
    if (pkgId) {
      const existingPkg = db
        .prepare('SELECT id FROM product_packagings WHERE id = ? AND product_id = ?')
        .get(pkgId, productId);
      if (!existingPkg) {
        throw new BusinessError('VALIDATION_ERROR', 'Conditionnement introuvable pour ce produit.', 404);
      }
      db.prepare(
        `UPDATE product_packagings
         SET name = ?, coefficient_milli = ?, purchase_price = ?, wholesale_price = ?, semi_wholesale_price = ?, retail_price = ?, barcode = ?, allow_fraction = ?, is_active = ?
         WHERE id = ? AND product_id = ?`
      ).run(
        pkg.name,
        coeffMilli,
        pkgPurchase,
        pkgWholesale,
        pkgSemi,
        pkgRetail,
        barcode,
        pkg.allow_fraction ? 1 : 0,
        pkg.is_active === false ? 0 : 1,
        pkgId,
        productId
      );
    } else {
      const res = db
        .prepare(
          `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          productId,
          pkg.name,
          prod.base_unit,
          coeffMilli,
          pkgPurchase,
          pkgWholesale,
          pkgSemi,
          pkgRetail,
          barcode,
          pkg.allow_fraction ? 1 : 0
        );
      pkgId = Number(res.lastInsertRowid);
    }

    const mode = pkg.deposit_mode === 'deposit' ? 'deposit' : 'none';
    db.prepare(
      'INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?) ON CONFLICT(packaging_id) DO UPDATE SET mode = excluded.mode'
    ).run(pkgId, mode);
    db.prepare('DELETE FROM deposit_packaging_components WHERE packaging_id = ?').run(pkgId);
    if (mode === 'deposit' && pkg.components?.length) {
      for (const c of pkg.components) {
        if (!Number.isInteger(c.pieces_per_pack) || c.pieces_per_pack <= 0) {
          throw new BusinessError('VALIDATION_ERROR', 'Pièces par conditionnement invalides.');
        }
        const rtExists = db
          .prepare('SELECT id FROM returnable_packaging_types WHERE id = ?')
          .get(c.returnable_id);
        if (!rtExists) {
          throw new BusinessError('VALIDATION_ERROR', "Type d'emballage consigné introuvable.");
        }
        db.prepare(
          'INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)'
        ).run(pkgId, c.returnable_id, c.pieces_per_pack);
      }
    }
    auditLog(db, 'UPSERT_PACKAGING', 'product_packagings', pkgId, `Conditionnement ${pkg.name} (coeff ${formatMilli(coeffMilli)})`);
    return getPackagingById(db, pkgId);
  });
}

export function exportProductsCsv(): string {
  requireCurrentActorPermission('catalog:read');
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.reference, p.barcode, p.name, p.brand, c.name AS category, p.base_unit, p.stock_milli, p.min_stock_milli,
              p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.is_active
       FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.reference`
    )
    .all() as Array<Record<string, unknown>>;

  const headers = [
    'reference',
    'barcode',
    'name',
    'brand',
    'category',
    'base_unit',
    'stock',
    'min_stock',
    'purchase_price',
    'wholesale_price',
    'semi_wholesale_price',
    'retail_price',
    'is_active',
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.join(';'),
    ...rows.map((r) =>
      [
        r.reference,
        r.barcode,
        r.name,
        r.brand,
        r.category,
        r.base_unit,
        formatMilli(Number(r.stock_milli)),
        formatMilli(Number(r.min_stock_milli)),
        r.purchase_price,
        r.wholesale_price,
        r.semi_wholesale_price,
        r.retail_price,
        r.is_active,
      ]
        .map(esc)
        .join(';')
    ),
  ];
  return lines.join('\n');
}

export async function importProductsCsv(csvContent: string) {
  requireCurrentActorPermission('catalog:write');
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new BusinessError('VALIDATION_ERROR', 'Le fichier CSV doit contenir un en-tête et au moins une ligne.');
  }
  const sep = lines[0].includes(';') ? ';' : ',';
  const parseRow = (line: string) =>
    line.split(sep).map((cell) => cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const headers = parseRow(lines[0]).map((h) => h.toLowerCase());

  const idx = (col: string) => headers.indexOf(col);
  if (idx('name') === -1 || idx('base_unit') === -1) {
    throw new BusinessError('VALIDATION_ERROR', 'Colonnes obligatoires manquantes : name, base_unit.');
  }

  let created = 0;
  await withWriteTx((db) => {
    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      const name = cols[idx('name')] || '';
      if (!name) continue;
      const catName = idx('category') >= 0 && cols[idx('category')] ? cols[idx('category')] : 'Divers';
      let cat = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(catName) as
        | { id: number }
        | undefined;
      if (!cat) {
        const res = db.prepare('INSERT INTO categories (name) VALUES (?)').run(catName);
        cat = { id: Number(res.lastInsertRowid) };
      }
      const barcode = idx('barcode') >= 0 && cols[idx('barcode')] ? cols[idx('barcode')] : null;
      if (barcode) {
        const dup =
          db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode) ??
          db.prepare('SELECT id FROM product_packagings WHERE barcode = ?').get(barcode);
        if (dup) {
          throw new BusinessError('DUPLICATE_OPERATION', `Ligne ${i + 1} : code-barres ${barcode} déjà existant.`);
        }
      }
      const stockMilli = idx('stock') >= 0 && cols[idx('stock')] ? nonNegativeMilli(cols[idx('stock')], 'Stock CSV') : 0;
      const minMilli = idx('min_stock') >= 0 && cols[idx('min_stock')] ? nonNegativeMilli(cols[idx('min_stock')], 'Seuil CSV') : 0;
      const pBuy = idx('purchase_price') >= 0 && cols[idx('purchase_price')] ? nonNegativeFcfa(cols[idx('purchase_price')], 'Prix achat') : null;
      const pWhole = idx('wholesale_price') >= 0 && cols[idx('wholesale_price')] ? nonNegativeFcfa(cols[idx('wholesale_price')], 'Prix gros') : null;
      const pSemi = idx('semi_wholesale_price') >= 0 && cols[idx('semi_wholesale_price')] ? nonNegativeFcfa(cols[idx('semi_wholesale_price')], 'Prix demi-gros') : null;
      const pRet = idx('retail_price') >= 0 && cols[idx('retail_price')] ? nonNegativeFcfa(cols[idx('retail_price')], 'Prix détail') : null;
      const baseUnit = cols[idx('base_unit')] || 'bouteille';
      const ref = nextSequence(db, 'PROD');

      const prodId = Number(
        db
          .prepare(
            `INSERT INTO products (reference, barcode, name, brand, category_id, base_unit, stock_milli, min_stock_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, average_cost_num, average_cost_den)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            ref,
            barcode,
            name,
            idx('brand') >= 0 ? cols[idx('brand')] || null : null,
            cat.id,
            baseUnit,
            stockMilli,
            minMilli,
            pBuy,
            pWhole,
            pSemi,
            pRet,
            pBuy !== null ? String(pBuy) : null,
            pBuy !== null ? '1' : null
          ).lastInsertRowid
      );

      const pkgName = ALLOWED_PACKAGING_NAMES.has(baseUnit) ? baseUnit : 'bouteille';
      const pkgId = Number(
        db
          .prepare(
            `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
             VALUES (?, ?, ?, 1000, ?, ?, ?, ?)`
          )
          .run(prodId, pkgName, baseUnit, pBuy, pWhole, pSemi, pRet).lastInsertRowid
      );
      db.prepare("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')").run(pkgId);
      created++;
    }
    auditLog(db, 'IMPORT_CSV', 'products', null, `${created} produit(s) importé(s) via CSV`);
  });
  return { created };
}

interface PresetBreweryMeta {
  brewery: 'SOLIBRA' | 'BRASSIVOIRE';
  name: string;
  company_name: string;
  phone: string;
  address: string;
  payment_terms_days: number;
}

interface PresetReturnableMeta {
  code: string;
  name: string;
  producer: string;
  kind: 'crate' | 'bottle' | 'palette' | 'other';
  description?: string | null;
  deposit_value: number;
}

interface PresetPackagingRaw {
  name: 'casier' | 'carton' | 'bouteille' | 'pack' | 'canette';
  coefficient: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  barcode?: string | null;
  allow_fraction: boolean;
  deposit_mode: 'none' | 'deposit';
  components?: Array<{ returnable_code: string; pieces_per_pack: number }>;
}

interface PresetProductRaw {
  key: string;
  brewery: 'SOLIBRA' | 'BRASSIVOIRE';
  name: string;
  brand: string;
  barcode: string;
  category: string;
  base_unit: string;
  initial_stock: string;
  min_stock: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  description: string;
  packagings: PresetPackagingRaw[];
}

interface BreweryCatalogFile {
  breweries: PresetBreweryMeta[];
  returnables: PresetReturnableMeta[];
  products: PresetProductRaw[];
}

let cachedCatalog: BreweryCatalogFile | null = null;
function loadBreweryCatalog(): BreweryCatalogFile {
  if (!cachedCatalog) {
    const raw = fs.readFileSync(new URL('../../catalog/brewery_catalog.json', import.meta.url), 'utf8');
    cachedCatalog = JSON.parse(raw) as BreweryCatalogFile;
  }
  return cachedCatalog;
}

export function listCatalogPresets() {
  requireCurrentActorPermission('catalog:read');
  const db = getDb();
  const catalog = loadBreweryCatalog();
  const retNames = new Map(catalog.returnables.map((r) => [r.code, r.name]));
  const matchStmt = db.prepare(
    'SELECT id, reference, is_active FROM products WHERE barcode = ? OR lower(name) = lower(?) LIMIT 1'
  );

  const items = catalog.products.map((p) => {
    const existing = matchStmt.get(p.barcode, p.name) as
      | { id: number; reference: string; is_active: number }
      | undefined;

    return {
      ...p,
      packagings: p.packagings.map((pk) => ({
        ...pk,
        barcode: pk.barcode ?? null,
        components: (pk.components ?? []).map((c) => ({
          returnable_code: c.returnable_code,
          returnable_name: retNames.get(c.returnable_code) ?? c.returnable_code,
          pieces_per_pack: c.pieces_per_pack,
        })),
      })),
      existing_product_id: existing ? Number(existing.id) : null,
      existing_reference: existing ? String(existing.reference) : null,
      existing_is_active: existing ? Number(existing.is_active) : null,
    };
  });

  return { items };
}

export async function applyCatalogPresets(input: { keys: string[]; activate?: boolean }) {
  requireCurrentActorPermission('catalog:write');
  const catalog = loadBreweryCatalog();
  const presetMap = new Map(catalog.products.map((p) => [p.key, p]));
  const breweryMap = new Map(catalog.breweries.map((b) => [b.brewery, b]));
  const returnableMap = new Map(catalog.returnables.map((r) => [r.code, r]));

  const dedupKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const rawKey of Array.isArray(input?.keys) ? input.keys : []) {
    const trimmed = String(rawKey || '').trim();
    if (!trimmed) continue;
    if (!presetMap.has(trimmed)) {
      throw new BusinessError('VALIDATION_ERROR', `Produit prédéfini introuvable : ${trimmed}`);
    }
    if (!seenKeys.has(trimmed)) {
      seenKeys.add(trimmed);
      dedupKeys.push(trimmed);
    }
  }
  if (dedupKeys.length === 0) {
    throw new BusinessError('VALIDATION_ERROR', 'Sélectionnez au moins un produit du catalogue prédéfini.');
  }

  const activate = input.activate !== false && Number(input.activate as unknown) !== 0;

  return withWriteTx((db) => {
    let created = 0;
    let reactivated = 0;
    let skipped = 0;
    const affectedIds: number[] = [];

    for (const key of dedupKeys) {
      const preset = presetMap.get(key)!;
      const existing = db
        .prepare('SELECT id, reference, is_active FROM products WHERE barcode = ? OR lower(name) = lower(?) LIMIT 1')
        .get(preset.barcode, preset.name) as
        | { id: number; reference: string; is_active: number }
        | undefined;

      if (existing) {
        if (activate && Number(existing.is_active) === 0) {
          db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(existing.id);
          reactivated++;
          affectedIds.push(Number(existing.id));
        } else {
          skipped++;
        }
        continue;
      }

      const supPattern = `%${preset.brewery.toUpperCase()}%`;
      const existingSup = db
        .prepare(
          "SELECT id FROM suppliers WHERE upper(name) LIKE ? OR upper(COALESCE(company_name, '')) LIKE ? ORDER BY id ASC LIMIT 1"
        )
        .get(supPattern, supPattern) as { id: number } | undefined;

      let supplierId: number;
      if (existingSup) {
        supplierId = Number(existingSup.id);
      } else {
        const meta = breweryMap.get(preset.brewery);
        if (!meta) {
          throw new BusinessError('INTERNAL_ERROR', `Métadonnées brasserie introuvables : ${preset.brewery}`);
        }
        const supCode = nextSequence(db, 'FRN');
        const supRes = db
          .prepare(
            'INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(supCode, meta.name, meta.company_name, meta.phone, meta.address, meta.payment_terms_days);
        supplierId = Number(supRes.lastInsertRowid);
      }

      const existingCat = db
        .prepare('SELECT id FROM categories WHERE lower(name) = lower(?)')
        .get(preset.category) as { id: number } | undefined;
      const categoryId = existingCat
        ? Number(existingCat.id)
        : Number(db.prepare('INSERT INTO categories (name) VALUES (?)').run(preset.category).lastInsertRowid);

      const dupPkgBc = db
        .prepare('SELECT id FROM product_packagings WHERE barcode = ? LIMIT 1')
        .get(preset.barcode);
      if (dupPkgBc) {
        throw new BusinessError(
          'DUPLICATE_OPERATION',
          `Code-barres déjà utilisé sur un conditionnement : ${preset.barcode}`
        );
      }

      const initialStockMilli = nonNegativeMilli(preset.initial_stock, 'Stock initial');
      const minStockMilli = nonNegativeMilli(preset.min_stock, 'Stock minimum');
      const purchasePrice = nonNegativeFcfa(preset.purchase_price, "Prix d'achat");
      const wholesalePrice = nonNegativeFcfa(preset.wholesale_price, 'Prix gros');
      const semiPrice = nonNegativeFcfa(preset.semi_wholesale_price, 'Prix demi-gros');
      const retailPrice = nonNegativeFcfa(preset.retail_price, 'Prix détail');
      const isActive = activate ? 1 : 0;

      const reference = nextSequence(db, 'PROD');
      const prodRes = db
        .prepare(
          `INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, description, base_unit,
                                 stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den,
                                 purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '1', ?, ?, ?, ?, NULL, ?)`
        )
        .run(
          reference,
          preset.barcode,
          preset.name,
          preset.brand,
          categoryId,
          supplierId,
          preset.description,
          preset.base_unit,
          initialStockMilli,
          minStockMilli,
          String(purchasePrice),
          purchasePrice,
          wholesalePrice,
          semiPrice,
          retailPrice,
          isActive
        );
      const productId = Number(prodRes.lastInsertRowid);

      for (const pk of preset.packagings) {
        if (!ALLOWED_PACKAGING_NAMES.has(pk.name)) {
          throw new BusinessError('INVALID_PACKAGING', `Conditionnement non autorisé : ${pk.name}`);
        }
        const coeffMilli = positiveMilli(pk.coefficient, `Coefficient (${pk.name})`);
        const pkgBc = pk.barcode?.trim() || null;
        if (pkgBc) {
          const dup = db
            .prepare(
              'SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?'
            )
            .get(pkgBc, pkgBc);
          if (dup) {
            throw new BusinessError('DUPLICATE_OPERATION', `Code-barres déjà utilisé : ${pkgBc}`);
          }
        }

        const pkgRes = db
          .prepare(
            `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            productId,
            pk.name,
            preset.base_unit,
            coeffMilli,
            pk.purchase_price,
            pk.wholesale_price,
            pk.semi_wholesale_price,
            pk.retail_price,
            pkgBc,
            pk.allow_fraction ? 1 : 0
          );
        const pkgId = Number(pkgRes.lastInsertRowid);
        const mode = pk.deposit_mode === 'deposit' ? 'deposit' : 'none';
        db.prepare('INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)').run(
          pkgId,
          mode
        );

        if (mode === 'deposit' && pk.components?.length) {
          for (const comp of pk.components) {
            const existingRt = db
              .prepare('SELECT id FROM returnable_packaging_types WHERE code = ?')
              .get(comp.returnable_code) as { id: number } | undefined;

            let rtId: number;
            if (existingRt) {
              rtId = Number(existingRt.id);
            } else {
              const rmeta = returnableMap.get(comp.returnable_code);
              if (!rmeta) {
                throw new BusinessError(
                  'INTERNAL_ERROR',
                  `Emballage consigné prédéfini introuvable : ${comp.returnable_code}`
                );
              }
              const newRtRes = db
                .prepare(
                  `INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value)
                   VALUES (?, ?, ?, ?, ?, ?)`
                )
                .run(
                  rmeta.code,
                  rmeta.name,
                  rmeta.producer,
                  rmeta.kind,
                  rmeta.description ?? null,
                  rmeta.deposit_value
                );
              rtId = Number(newRtRes.lastInsertRowid);
              db.prepare(
                'INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, 0)'
              ).run(rtId);
            }

            db.prepare(
              'INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)'
            ).run(pkgId, rtId, comp.pieces_per_pack);
          }
        }
      }

      created++;
      affectedIds.push(productId);
    }

    if (created > 0 || reactivated > 0) {
      auditLog(
        db,
        'APPLY_CATALOG_PRESETS',
        'products',
        null,
        `Catalogue brasseries : ${created} créé(s), ${reactivated} réactivé(s), ${skipped} ignoré(s) (actif=${activate})`
      );
    }

    return {
      created,
      reactivated,
      skipped,
      activate,
      products: affectedIds.map((pid) => getProductById(db, pid)),
    };
  });
}
