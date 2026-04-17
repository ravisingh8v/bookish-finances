import Dexie, { Table } from "dexie";

export type SyncActionType =
  | "create_book"
  | "update_book"
  | "delete_book"
  | "create_expense"
  | "update_expense"
  | "delete_expense"
  | "add_member"
  | "remove_member"
  | "update_member_role";

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: Record<string, unknown>;
  tempId?: string;
  createdAt: number;
  retryCount: number;
  lastAttempt?: number;
  userId?: string;
}

export function createSyncActionId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}

export interface CachedBook {
  id: string;
  data: unknown;
  cachedAt: number;
}

export interface CachedExpenses {
  id: string;
  expenses: unknown[];
  userId?: string;
  cachedAt: number;
}

export interface CachedCategories {
  id: string;
  data: unknown[];
  cachedAt: number;
}

export interface CachedDashboard {
  id: string;
  data: unknown;
  cachedAt: number;
}

export interface DeletedExpense {
  id: string;
  bookId: string;
  userId?: string;
  data: unknown;
  deletedAt: number;
}

export class ExpenseFlowDB extends Dexie {
  syncQueue!: Table<SyncAction>;
  books!: Table<CachedBook>;
  expenses!: Table<CachedExpenses>;
  categories!: Table<CachedCategories>;
  dashboard!: Table<CachedDashboard>;
  deletedExpenses!: Table<DeletedExpense>;

  constructor() {
    super("expenseflow_v3");
    this.version(1).stores({
      syncQueue: "id, type, createdAt, userId, retryCount",
      books: "id, cachedAt",
      expenses: "id, cachedAt",
      categories: "id",
      dashboard: "id",
      deletedExpenses: "id, bookId, deletedAt",
    });
    this.version(2).stores({
      syncQueue: "id, type, createdAt, userId, retryCount",
      books: "id, cachedAt",
      expenses: "id, userId, cachedAt",
      categories: "id",
      dashboard: "id",
      deletedExpenses: "id, bookId, userId, deletedAt",
    });
  }
}

export const db = new ExpenseFlowDB();
