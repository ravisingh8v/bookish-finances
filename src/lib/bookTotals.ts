import { supabase } from "@/integrations/supabase/client";

function signedAmount(row: { amount?: number | string | null; expense_type?: string | null }) {
  const amount = Number(row?.amount) || 0;
  return row?.expense_type === "credit" ? amount : -amount;
}

export async function getBookTotals(
  bookIds: string[],
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  for (const id of bookIds) totals[id] = 0;

  if (bookIds.length === 0) return totals;

  const { data, error } = await supabase
    .from("expenses")
    .select("book_id, amount, expense_type")
    .in("book_id", bookIds);
  if (error) throw error;

  for (const row of data ?? []) {
    totals[row.book_id] = (totals[row.book_id] ?? 0) + signedAmount(row);
  }
  return totals;
}