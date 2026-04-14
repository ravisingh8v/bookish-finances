import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

export interface Expense {
  id: string;
  book_id: string;
  title: string;
  amount: number;
  date: string;
  category_id: string | null;
  expense_type: string;
  payment_method: string | null;
  notes: string | null;
  tags: string[] | null;
  paid_by: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  categories: { name: string; icon: string; color: string } | null;
  creator_profile?: {
    display_name: string | null;
    email: string | null;
  } | null;
  payer_profile?: { display_name: string | null; email: string | null } | null;
}

export function useExpenses(bookId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(`*, categories(name, icon, color)`)
        .eq("book_id", bookId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for all unique user ids (created_by + paid_by)
      const userIds = [
        ...new Set(data.flatMap((e) => [e.created_by, e.paid_by])),
      ];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((e) => ({
        ...e,
        creator_profile: profileMap.get(e.created_by) ?? null,
        payer_profile: profileMap.get(e.paid_by) ?? null,
      })) as Expense[];
    },
    enabled: !!bookId && !!user,
  });

  const createExpense = useMutation({
    mutationFn: async (expense: {
      title: string;
      amount: number;
      date?: string;
      category_id?: string;
      expense_type?: string;
      payment_method?: string;
      notes?: string;
      tags?: string[];
    }) => {
      if (!isOnline) {
        await queueAction({
          type: "create_expense",
          payload: { ...expense, book_id: bookId },
          userId: user?.id,
        });
        return { id: crypto.randomUUID(), ...expense, offline: true };
      }

      const { data, error } = await supabase
        .from("expenses")
        .insert({
          ...expense,
          book_id: bookId,
          paid_by: user!.id,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!isOnline) {
        await queueAction({
          type: "delete_expense",
          payload: { expenseId },
          userId: user?.id,
        });
        return;
      }

      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  return {
    expenses: expensesQuery.data ?? [],
    isLoading: expensesQuery.isLoading,
    createExpense,
    deleteExpense,
  };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_default", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}
