import type { TipTopic } from './tips/types.ts';
import {
  CASH_TIP,
  EXPENSES_TIP,
  SALES_HISTORY_TIP,
  SALES_POS_TIP,
} from './tips/commerceTips.ts';
import {
  INVENTORIES_TIP,
  PRODUCTS_TIP,
  STOCK_TIP,
} from './tips/catalogStockTips.ts';
import {
  CLIENTS_TIP,
  CONSIGNMENTS_TIP,
  DEBTS_TIP,
  PURCHASES_TIP,
  SUPPLIERS_TIP,
} from './tips/partiesConsignmentsTips.ts';
import {
  BACKUPS_TIP,
  DASHBOARD_TIP,
  REPORTS_TIP,
  SETTINGS_TIP,
} from './tips/systemTips.ts';

/* ============================================================================
 * Référentiel consolidé des conseils & règles métier par écran
 * ============================================================================ */

export type { TipFieldGuide, TipTabGuide, TipTopic } from './tips/types.ts';

export const BUSINESS_TIPS_TOPICS: TipTopic[] = [
  DASHBOARD_TIP,
  SALES_POS_TIP,
  SALES_HISTORY_TIP,
  CLIENTS_TIP,
  DEBTS_TIP,
  PRODUCTS_TIP,
  STOCK_TIP,
  INVENTORIES_TIP,
  CONSIGNMENTS_TIP,
  SUPPLIERS_TIP,
  PURCHASES_TIP,
  CASH_TIP,
  EXPENSES_TIP,
  REPORTS_TIP,
  SETTINGS_TIP,
  BACKUPS_TIP,
];

const ROUTE_TO_TOPIC: Record<string, string> = {
  '/': 'dashboard',
  '/sales/new': 'sales-pos',
  '/sales': 'sales-history',
  '/clients': 'clients',
  '/debts': 'debts',
  '/products': 'products',
  '/stock': 'stock',
  '/inventories': 'inventories',
  '/consignments': 'consignments',
  '/suppliers': 'suppliers',
  '/purchases': 'purchases',
  '/cash': 'cash',
  '/expenses': 'expenses',
  '/reports': 'reports',
  '/settings': 'settings',
  '/backups': 'backups',
};

export function resolveTopicIdFromPath(pathname: string): string {
  return ROUTE_TO_TOPIC[pathname] ?? 'dashboard';
}
