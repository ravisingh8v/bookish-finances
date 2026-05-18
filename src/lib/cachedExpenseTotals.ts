import { db } from "@/lib/db";
import { getCurrentUserId, getStoredExpenses } from "@/lib/offlineJournal";
import { supabase } from "@/integrations/supabase/client";

type CachedExpenseLike = {
  amount?: number | string | null;
  expense_type?: string | null;
};

const BASELINE_KEY = "expenseflow_book_totals_baseline_v1";
const DELTA_KEY = "expenseflow_book_totals_delta_v1";

function scopedKey(base: string, userId?: string) {
  return `${base}:${userId || getCurrentUserId()}`;
}

function readMap(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getBaseline(userId?: string) {
  return readMap(scopedKey(BASELINE_KEY, userId));
}
function setBaseline(map: Record<string, number>, userId?: string) {
  writeMap(scopedKey(BASELINE_KEY, userId), map);
}
function getDelta(userId?: string) {
  return readMap(scopedKey(DELTA_KEY, userId));
}
function setDelta(map: Record<string, number>, userId?: string) {
  writeMap(scopedKey(DELTA_KEY, userId), map);
}

export function signedExpenseAmount(expense: CachedExpenseLike) {
  const amount = Number(expense?.amount) || 0;
  return expense?.expense_type === "credit" ? amount : -amount;
}

/**
 * Record an offline (or optimistic) delta against a book's running total.
 * Cleared automatically the next time we successfully fetch authoritative
 * totals from the server in `getBookTotals`.
 */
export function recordBookTotalDelta(
  bookId: string,
  delta: number,
  userId?: string,
) {
  if (!bookId || !delta) return;
  const map = getDelta(userId);
  map[bookId] = (map[bookId] ?? 0) + delta;
  setDelta(map, userId);
}

/** Clear all per-book offline deltas (call after the sync queue drains). */
export function clearAllBookTotalDeltas(userId?: string) {
  setDelta({}, userId);
}

export async function getCachedExpensesForBook(
  bookId: string,
  userId?: string,
) {
  const storedExpenses = getStoredExpenses<CachedExpenseLike>(bookId, userId);
  if (storedExpenses.length > 0) {
    return storedExpenses;
  }

  try {
    const cached = await db.expenses.get(bookId);
    if (
      cached &&
      Array.isArray(cached.expenses) &&
      (!cached.userId || !userId || cached.userId === userId)
    ) {
      return cached.expenses as CachedExpenseLike[];
    }
  } catch {
    // Ignore IndexedDB failures and keep local-storage fallback.
  }

  return [];
}

export function sumExpenseBalance(expenses: CachedExpenseLike[]) {
  return expenses.reduce((sum, e) => sum + signedExpenseAmount(e), 0);
}

export async function getBookTotalsFromCache(
  bookIds: string[],
  userId?: string,
) {
  const totals: Record<string, number> = {};

  await Promise.all(
    bookIds.map(async (bookId) => {
      totals[bookId] = sumExpenseBalance(
        await getCachedExpensesForBook(bookId, userId),
      );
    }),
  );

  return totals;
}

/**
 * Offline-friendly totals. Uses the last server baseline + any pending
 * offline deltas. Falls back to summing cached expenses if no baseline
 * is available yet.
 */
async function getOfflineBookTotals(bookIds: string[], userId?: string) {
  const baseline = getBaseline(userId);
  const delta = getDelta(userId);
  const totals: Record<string, number> = {};

  await Promise.all(
    bookIds.map(async (bookId) => {
      if (bookId.startsWith("temp_")) {
        // Offline-created books: always derive from cache + delta
        const cacheSum = sumExpenseBalance(
          await getCachedExpensesForBook(bookId, userId),
        );
        totals[bookId] = cacheSum + (delta[bookId] ?? 0);
        return;
      }
      if (bookId in baseline) {
        totals[bookId] = baseline[bookId] + (delta[bookId] ?? 0);
      } else {
        // No baseline yet (first-time offline). Use cached expenses + delta.
        const cacheSum = sumExpenseBalance(
          await getCachedExpensesForBook(bookId, userId),
        );
        totals[bookId] = cacheSum + (delta[bookId] ?? 0);
      }
    }),
  );

  return totals;
}

/**
 * Fetch accurate book totals. When online, queries ALL expenses from the
 * server and persists a baseline so we can keep showing accurate numbers
 * offline (combined with any unsynced offline mutations).
 */
export async function getBookTotals(
  bookIds: string[],
  userId?: string,
  isOnline = true,
) {
  if (bookIds.length === 0) return {};
  if (!isOnline) {
    return getOfflineBookTotals(bookIds, userId);
  }

  const realIds = bookIds.filter((id) => !id.startsWith("temp_"));
  const totals: Record<string, number> = {};
  for (const id of bookIds) totals[id] = 0;

  try {
    let serverTotals: Record<string, number> = {};
    if (realIds.length > 0) {
      const { data, error } = await supabase
        .from("expenses")
        .select("book_id, amount, expense_type")
        .in("book_id", realIds);
      if (error) throw error;

      for (const id of realIds) serverTotals[id] = 0;
      for (const row of data ?? []) {
        serverTotals[row.book_id] =
          (serverTotals[row.book_id] ?? 0) + signedExpenseAmount(row);
      }
    }

    // Persist baseline + reset deltas for these books (server is now truth).
    const baseline = getBaseline(userId);
    const delta = getDelta(userId);
    for (const id of realIds) {
      baseline[id] = serverTotals[id] ?? 0;
      delete delta[id];
      totals[id] = serverTotals[id] ?? 0;
    }
    setBaseline(baseline, userId);
    setDelta(delta, userId);

    // Temp (offline-created) books: still use cache + delta
    const tempIds = bookIds.filter((id) => id.startsWith("temp_"));
    if (tempIds.length > 0) {
      const tempTotals = await getOfflineBookTotals(tempIds, userId);
      Object.assign(totals, tempTotals);
    }

    return totals;
  } catch {
    return getOfflineBookTotals(bookIds, userId);
  }
}

export async function getDashboardStatsFromCache(
  bookIds: string[],
  userId?: string,
) {
  const allExpenses = (
    await Promise.all(
      bookIds.map((bookId) => getCachedExpensesForBook(bookId, userId)),
    )
  ).flat();

  const totalExpense = allExpenses
    .filter((expense) => expense.expense_type === "debit")
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const totalIncome = allExpenses
    .filter((expense) => expense.expense_type === "credit")
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  return {
    totalExpense,
    totalIncome,
    balance: totalIncome - totalExpense,
    count: allExpenses.length,
  };
}
