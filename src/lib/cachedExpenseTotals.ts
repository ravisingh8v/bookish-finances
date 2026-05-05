import { db } from "@/lib/db";
import { getStoredExpenses } from "@/lib/offlineJournal";

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
