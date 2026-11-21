/* ============================================================================
 * Types métier : Authentification, Rôles & Tarification
 * ============================================================================ */

export type PackagingName =
  | "casier"
  | "carton"
  | "bouteille"
  | "pack"
  | "canette";

export type SalesUnitType =
  | "bottle"
  | "can"
  | "pack"
  | "carton"
  | "half_crate"
  | "crate"
  | "film"
  | "pallet"
  | "custom";

export type PriceTier = "retail" | "semi_wholesale" | "wholesale";
export type CreditPolicy = "forbidden" | "limited" | "unlimited";
export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "stock_manager"
  | "accountant";

export interface SessionUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  permissions: string[];
}

export interface UserAccount {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

export interface AuthStatus {
  needsSetup: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  authenticated?: boolean;
  user?: SessionUser;
}
