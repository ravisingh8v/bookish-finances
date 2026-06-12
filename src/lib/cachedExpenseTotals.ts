import { supabase } from "@/integrations/supabase/client";

function signedAmount(row: { amount?: number | string | null; expense_type?: string | null }) {
  const amount = Number(row?.amount) || 0;
  return row?.expense_type === "credit" ? amount : -amount;
}

/**
 * Online book balances (income - expense) for the given books, computed
 * directly from the server. Offline support has been removed; callers should
 * guard on connectivity and surface an error when offline.
 */
export async function getBookTotals(
  bookIds: string[],
  _userId?: string,
  isOnline = true,
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  for (const id of bookIds) totals[id] = 0;

  const realIds = bookIds.filter((id) => !id.startsWith("temp_"));
  if (!isOnline || realIds.length === 0) return totals;

  const { data, error } = await supabase
    .from("expenses")
    .select("book_id, amount, expense_type")
    .in("book_id", realIds);
  if (error) throw error;

  for (const row of data ?? []) {
    totals[row.book_id] = (totals[row.book_id] ?? 0) + signedAmount(row);
  }
  return totals;
}

/**
 * Aggregate dashboard stats across the user's books, computed from the server.
 */
export async function getDashboardStatsFromCache(
  bookIds: string[],
  _userId?: string,
) {
  const realIds = bookIds.filter((id) => !id.startsWith("temp_"));
  if (realIds.length === 0) {
    return { totalExpense: 0, totalIncome: 0, balance: 0, count: 0 };
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("amount, expense_type")
    .in("book_id", realIds);
  if (error) throw error;

  let totalExpense = 0;
  let totalIncome = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount) || 0;
    if (row.expense_type === "credit") totalIncome += amount;
    else totalExpense += amount;
  }

  return {
    totalExpense,
    totalIncome,
    balance: totalIncome - totalExpense,
    count: (data ?? []).length,
  };
}
