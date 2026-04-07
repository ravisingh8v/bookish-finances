import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useExpenses(bookId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, categories(name, icon, color)")
        .eq("book_id", bookId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!bookId && !!user,
  });

  const createExpense = useMutation({
    mutationFn: async (expense: {
      title: string; amount: number; date?: string; category_id?: string;
      expense_type?: string; payment_method?: string; notes?: string; tags?: string[];
    }) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ ...expense, book_id: bookId, paid_by: user!.id, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  return { expenses: expensesQuery.data ?? [], isLoading: expensesQuery.isLoading, createExpense, deleteExpense };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("is_default", true).order("name");
      if (error) throw error;
      return data;
    },
  });
}
