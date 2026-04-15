import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { toast } from "sonner";

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
  creator_profile?: { display_name: string | null; email: string | null } | null;
  payer_profile?: { display_name: string | null; email: string | null } | null;
  _offline?: boolean;
}

const MAX_EXPENSES_CACHE = 50;
const PAGE_SIZE = 20;

export function useExpenses(bookId: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      // Serve from Dexie first
      const cached = await db.expenses.get(bookId);
      const cachedExpenses = (cached?.expenses ?? []) as Expense[];

      if (!isOnline) return cachedExpenses;

      try {
        const { data, error } = await supabase
          .from("expenses")
          .select("*, categories(name, icon, color)")
          .eq("book_id", bookId)
          .order("created_at", { ascending: false })
          .limit(MAX_EXPENSES_CACHE);
        if (error) throw error;

        const userIds = [...new Set((data ?? []).flatMap((e) => [e.created_by, e.paid_by]).filter(Boolean))];
        let profileMap = new Map<string, { display_name: string | null; email: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds);
          profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
        }

        const enriched = (data ?? []).map((e) => ({
          ...e,
          creator_profile: profileMap.get(e.created_by) ?? null,
          payer_profile: profileMap.get(e.paid_by) ?? null,
        })) as Expense[];

        await db.expenses.put({ id: bookId, expenses: enriched, cachedAt: Date.now() });
        return enriched;
      } catch {
        return cachedExpenses;
      }
    },
    enabled: !!user && !!bookId,
    staleTime: 30_000,
  });

  const expenses = expensesQuery.data ?? [];

  const createExpense = useMutation({
    mutationFn: async (payload: {
      book_id: string;
      title: string;
      amount: number;
      date?: string;
      category_id?: string;
      expense_type?: string;
      payment_method?: string;
      notes?: string;
      tags?: string[];
    }) => {
      const tempId = `temp_${crypto.randomUUID()}`;
      const tempExpense: Expense = {
        id: tempId,
        book_id: payload.book_id,
        title: payload.title,
        amount: payload.amount,
        date: payload.date ?? new Date().toISOString().split("T")[0],
        category_id: payload.category_id ?? null,
        expense_type: payload.expense_type ?? "debit",
        payment_method: payload.payment_method ?? "cash",
        notes: payload.notes ?? null,
        tags: payload.tags ?? [],
        paid_by: user!.id,
        created_by: user!.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        categories: null,
        creator_profile: { display_name: profile?.display_name ?? null, email: profile?.email ?? null },
        payer_profile: { display_name: profile?.display_name ?? null, email: profile?.email ?? null },
        _offline: !isOnline,
      };

      // Optimistic update
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => [tempExpense, ...(old ?? [])]);
      const current = await db.expenses.get(bookId);
      await db.expenses.put({ id: bookId, expenses: [tempExpense, ...(current?.expenses ?? [])].slice(0, MAX_EXPENSES_CACHE), cachedAt: Date.now() });

      if (!isOnline) {
        await queueAction({ type: "create_expense", payload: { ...payload, tempId }, tempId, userId: user?.id });
        return tempExpense;
      }

      const { data, error } = await supabase.from("expenses").insert({
        ...payload,
        category_id: payload.category_id || null,
        expense_type: payload.expense_type ?? "debit",
        payment_method: payload.payment_method ?? "cash",
        notes: payload.notes ?? null,
        tags: payload.tags ?? [],
        paid_by: user!.id,
        created_by: user!.id,
      }).select("*, categories(name, icon, color)").single();
      if (error) throw error;

      // Replace temp with real
      const realExpense = { ...data, creator_profile: { display_name: profile?.display_name ?? null, email: profile?.email ?? null }, payer_profile: null } as Expense;
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) =>
        (old ?? []).map((e) => (e.id === tempId ? realExpense : e))
      );
      const updated = await db.expenses.get(bookId);
      if (updated) {
        await db.expenses.put({ id: bookId, expenses: updated.expenses.map((e) => (e as Expense).id === tempId ? realExpense : e), cachedAt: Date.now() });
      }
      return realExpense;
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async (params: {
      expenseId: string;
      title?: string;
      amount?: number;
      date?: string;
      category_id?: string;
      expense_type?: string;
      payment_method?: string;
      notes?: string;
      tags?: string[];
    }) => {
      // Optimistic update
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) =>
        (old ?? []).map((e) => (e.id === params.expenseId ? { ...e, ...params } : e))
      );
      const cached = await db.expenses.get(bookId);
      if (cached) {
        await db.expenses.put({ id: bookId, expenses: cached.expenses.map((e) => (e as Expense).id === params.expenseId ? { ...e, ...params } : e), cachedAt: Date.now() });
      }

      if (!isOnline) {
        await queueAction({ type: "update_expense", payload: { ...params, bookId }, userId: user?.id });
        return;
      }

      const update: Record<string, unknown> = {};
      if (params.title !== undefined) update.title = params.title;
      if (params.amount !== undefined) update.amount = params.amount;
      if (params.date !== undefined) update.date = params.date;
      if (params.category_id !== undefined) update.category_id = params.category_id || null;
      if (params.expense_type !== undefined) update.expense_type = params.expense_type;
      if (params.payment_method !== undefined) update.payment_method = params.payment_method;
      if (params.notes !== undefined) update.notes = params.notes;
      if (params.tags !== undefined) update.tags = params.tags;
      const { error } = await supabase.from("expenses").update(update).eq("id", params.expenseId);
      if (error) throw error;
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      // Save to deleted store for undo
      const expense = expenses.find((e) => e.id === expenseId);
      if (expense) {
        await db.deletedExpenses.put({ id: expenseId, bookId, data: expense as unknown as Record<string, unknown>, deletedAt: Date.now() });
      }

      // Optimistic remove
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) =>
        (old ?? []).filter((e) => e.id !== expenseId)
      );
      const cached = await db.expenses.get(bookId);
      if (cached) {
        await db.expenses.put({ id: bookId, expenses: cached.expenses.filter((e) => (e as Expense).id !== expenseId), cachedAt: Date.now() });
      }

      if (!isOnline) {
        await queueAction({ type: "delete_expense", payload: { expenseId }, userId: user?.id });
        return;
      }

      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
      if (error) throw error;
      await db.deletedExpenses.delete(expenseId);
    },
    onSuccess: () => {
      toast("Expense deleted", {
        action: {
          label: "Undo",
          onClick: () => restoreExpense.mutate(expenses.find((e) => true)?.id ?? ""),
        },
        duration: 4000,
      });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ["expenses", bookId] }),
  });

  const restoreExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const deleted = await db.deletedExpenses.get(expenseId);
      if (!deleted) return;

      const expense = deleted.data as Expense;

      // Re-add to local cache
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => {
        const current = old ?? [];
        if (current.find((e) => e.id === expenseId)) return current;
        return [{ ...expense, _offline: !isOnline }, ...current];
      });
      const cached = await db.expenses.get(bookId);
      if (cached && !cached.expenses.find((e) => (e as Expense).id === expenseId)) {
        await db.expenses.put({ id: bookId, expenses: [expense, ...cached.expenses].slice(0, MAX_EXPENSES_CACHE), cachedAt: Date.now() });
      }
      await db.deletedExpenses.delete(expenseId);

      if (!isOnline) {
        // Cancel pending delete if any
        const pending = await db.syncQueue.where("type").equals("delete_expense").toArray();
        const match = pending.find((a) => (a.payload as { expenseId: string }).expenseId === expenseId);
        if (match) {
          await db.syncQueue.delete(match.id);
        } else {
          await queueAction({ type: "create_expense", payload: { book_id: bookId, title: expense.title, amount: expense.amount, date: expense.date, category_id: expense.category_id ?? undefined, expense_type: expense.expense_type, payment_method: expense.payment_method ?? undefined, notes: expense.notes ?? undefined, tags: expense.tags ?? undefined, tempId: expenseId }, tempId: expenseId, userId: user?.id });
        }
        return;
      }

      // Re-insert to Supabase
      await supabase.from("expenses").insert({
        book_id: expense.book_id, title: expense.title, amount: expense.amount,
        date: expense.date, category_id: expense.category_id, expense_type: expense.expense_type,
        payment_method: expense.payment_method, notes: expense.notes, tags: expense.tags ?? [],
        paid_by: expense.paid_by, created_by: expense.created_by,
      });
    },
    onSuccess: () => toast.success("Expense restored!"),
  });

  // Paginated fetch of older expenses (load more)
  const fetchNextPage = async () => {
    if (!isOnline) return;
    const current = expenses.length;
    const { data, error } = await supabase
      .from("expenses")
      .select("*, categories(name, icon, color)")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .range(current, current + PAGE_SIZE - 1);
    if (error || !data?.length) return;

    queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => [...(old ?? []), ...data as Expense[]]);
  };

  return {
    expenses,
    isLoading: expensesQuery.isLoading && isOnline && expenses.length === 0,
    createExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    fetchNextPage,
    hasNextPage: isOnline && expenses.length >= PAGE_SIZE,
    isFetchingNextPage: false,
  };
}

export function useCategories() {
  const { isOnline } = useOfflineSync();

  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const cached = await db.categories.get("default");
      if (!isOnline) return (cached?.data ?? []) as { id: string; name: string; icon: string; color: string; is_default: boolean }[];

      try {
        const { data, error } = await supabase.from("categories").select("*").eq("is_default", true).order("name");
        if (error) throw error;
        if (data) await db.categories.put({ id: "default", data, cachedAt: Date.now() });
        return data ?? [];
      } catch {
        return (cached?.data ?? []) as { id: string; name: string; icon: string; color: string; is_default: boolean }[];
      }
    },
    staleTime: 300_000,
  });
}
