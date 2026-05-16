import { db } from "@/lib/db";
import { getStoredExpenses } from "@/lib/offlineJournal";
import { supabase } from "@/integrations/supabase/client";

type CachedExpenseLike = {
  amount?: number | string | null;
  expense_type?: string | null;
};

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
  return expenses.reduce((sum, expense) => {
    const amount = Number(expense.amount) || 0;
    return expense.expense_type === "credit" ? sum + amount : sum - amount;
  }, 0);
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
 * Fetch accurate book totals. When online, queries ALL expenses from the
 * server (cache only holds the latest 20-50, so cache totals are partial).
 * Falls back to cache when offline or on error.
 */
export async function getBookTotals(
  bookIds: string[],
  userId?: string,
  isOnline = true,
) {
  if (!isOnline || bookIds.length === 0) {
    return getBookTotalsFromCache(bookIds, userId);
  }

  const realIds = bookIds.filter((id) => !id.startsWith("temp_"));
  const totals: Record<string, number> = {};
  for (const id of bookIds) totals[id] = 0;

  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("book_id, amount, expense_type")
      .in("book_id", realIds);
    if (error) throw error;

    for (const row of data ?? []) {
      const amount = Number(row.amount) || 0;
      const delta = row.expense_type === "credit" ? amount : -amount;
      totals[row.book_id] = (totals[row.book_id] ?? 0) + delta;
    }

    // Temp (offline-created) books: still use cache
    const tempIds = bookIds.filter((id) => id.startsWith("temp_"));
    if (tempIds.length > 0) {
      const tempTotals = await getBookTotalsFromCache(tempIds, userId);
      Object.assign(totals, tempTotals);
    }

    return totals;
  } catch {
    return getBookTotalsFromCache(bookIds, userId);
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
