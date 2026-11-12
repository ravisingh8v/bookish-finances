import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

export type ChecklistItem = Tables<"recurring_expense_checklist_items">;
export type ChecklistSourceExpense = Pick<
  Tables<"expenses">,
  "id" | "title" | "amount" | "notes"
>;

function assertOnline(isOnline: boolean) {
  if (!isOnline) throw new Error("Connect to the internet to update your checklist.");
}

export function useRecurringExpenseChecklist(monthStart: string) {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();
  const queryKey = ["recurring-expense-checklist", user?.id, monthStart] as const;

  const checklistQuery = useQuery({
    queryKey,
    enabled: !!user && isOnline,
    queryFn: async () => {
      if (!user) return { items: [] as ChecklistItem[], completedIds: [] as string[] };
      const { data: items, error: itemError } = await supabase
        .from("recurring_expense_checklist_items")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order")
        .order("created_at");
      if (itemError) throw itemError;

      const ids = (items ?? []).map((item) => item.id);
      if (ids.length === 0) return { items: [] as ChecklistItem[], completedIds: [] as string[] };

      const { data: completions, error: completionError } = await supabase
        .from("recurring_expense_checklist_completions")
        .select("item_id")
        .eq("month_start", monthStart)
        .in("item_id", ids);
      if (completionError) throw completionError;
      return {
        items: (items ?? []) as ChecklistItem[],
        completedIds: (completions ?? []).map((completion) => completion.item_id),
      };
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`recurring-checklist-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_expense_checklist_items", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["recurring-expense-checklist", user.id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_expense_checklist_completions" },
        () => queryClient.invalidateQueries({ queryKey: ["recurring-expense-checklist", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recurring-expense-checklist", user?.id] });

  const saveItem = useMutation({
    mutationFn: async (input: { id?: string; title: string; amount: number | null; notes: string | null }) => {
      assertOnline(isOnline);
      if (!user) throw new Error("Please sign in to manage your checklist.");
      const values: TablesUpdate<"recurring_expense_checklist_items"> = {
        title: input.title.trim(),
        amount: input.amount,
        notes: input.notes,
      };
      if (input.id) {
        const { error } = await supabase
          .from("recurring_expense_checklist_items")
          .update(values)
          .eq("id", input.id)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const row: TablesInsert<"recurring_expense_checklist_items"> = {
        ...values,
        user_id: user.id,
        sort_order: (checklistQuery.data?.items.length ?? 0),
      };
      const { error } = await supabase.from("recurring_expense_checklist_items").insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("recurring_expense_checklist_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const setCompleted = useMutation({
    mutationFn: async ({ itemId, completed }: { itemId: string; completed: boolean }) => {
      assertOnline(isOnline);
      if (completed) {
        const row: TablesInsert<"recurring_expense_checklist_completions"> = {
          item_id: itemId,
          month_start: monthStart,
        };
        const { error } = await supabase.from("recurring_expense_checklist_completions").insert(row);
        if (error && error.code !== "23505") throw error;
        return;
      }
      const { error } = await supabase
        .from("recurring_expense_checklist_completions")
        .delete()
        .eq("item_id", itemId)
        .eq("month_start", monthStart);
      if (error) throw error;
    },
    onMutate: async ({ itemId, completed }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: { items: ChecklistItem[]; completedIds: string[] } | undefined) => {
        const completedIds = new Set(old?.completedIds ?? []);
        if (completed) completedIds.add(itemId);
        else completedIds.delete(itemId);
        return { items: old?.items ?? [], completedIds: [...completedIds] };
      });
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(error.message);
    },
    onSettled: invalidate,
  });

  const importExpenses = useMutation({
    mutationFn: async (expenses: ChecklistSourceExpense[]) => {
      assertOnline(isOnline);
      if (!user) throw new Error("Please sign in to manage your checklist.");
      if (expenses.length === 0) return;
      const startOrder = checklistQuery.data?.items.length ?? 0;
      const rows: TablesInsert<"recurring_expense_checklist_items">[] = expenses.map((expense, index) => ({
        user_id: user.id,
        title: expense.title,
        amount: Number(expense.amount) || null,
        notes: expense.notes,
        sort_order: startOrder + index,
      }));
      const { error } = await supabase.from("recurring_expense_checklist_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMonth = useMutation({
    mutationFn: async () => {
      assertOnline(isOnline);
      const itemIds = checklistQuery.data?.items.map((item) => item.id) ?? [];
      if (itemIds.length === 0) return;
      const { error } = await supabase
        .from("recurring_expense_checklist_completions")
        .delete()
        .eq("month_start", monthStart)
        .in("item_id", itemIds);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    items: checklistQuery.data?.items ?? [],
    completedIds: new Set(checklistQuery.data?.completedIds ?? []),
    isLoading: checklistQuery.isLoading,
    isOnline,
    saveItem: saveItem.mutateAsync,
    deleteItem: deleteItem.mutateAsync,
    setCompleted: setCompleted.mutate,
    importExpenses: importExpenses.mutateAsync,
    resetMonth: resetMonth.mutateAsync,
    isSaving: saveItem.isPending || importExpenses.isPending,
    isUpdating: setCompleted.isPending || resetMonth.isPending,
  };
}