import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { getCacheEntry, setCacheEntry } from "@/lib/offlineStore";
import { useCallback, useMemo } from "react";

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
  _offline?: boolean;
}

const PAGE_SIZE = 20;
const MAX_CACHED_EXPENSES = 100; // Increased to support better offline experience with multiple pages

export function useExpenses(bookId: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();
  const expenseCacheKey = `expenses:${bookId}`;

  const cacheFetchedExpenses = useCallback(
    async (fetchedExpenses: Expense[], reset = false) => {
      const existingExpenses = reset
        ? []
        : ((await getCacheEntry<Expense[]>(expenseCacheKey)) ?? []);
      const existingIds = new Set(existingExpenses.map((expense) => expense.id));
      const mergedExpenses = reset
        ? fetchedExpenses
        : [
            ...existingExpenses,
            ...fetchedExpenses.filter((expense) => !existingIds.has(expense.id)),
          ];

      await setCacheEntry(expenseCacheKey, mergedExpenses.slice(0, MAX_CACHED_EXPENSES));
    },
    [expenseCacheKey],
  );

  const updateExpenseState = useCallback(
    (updater: (pages: Expense[][]) => Expense[][]) => {
      let flattenedExpenses: Expense[] = [];

      queryClient.setQueryData(
        ["expenses", bookId],
        (old:
          | {
              pages?: Expense[][];
              pageParams?: number[];
            }
          | undefined) => {
          const currentPages = old?.pages?.length ? old.pages : [[]];
          const nextPages = updater(currentPages);
          const safePages = nextPages.length ? nextPages : [[]];

          flattenedExpenses = safePages.flat().slice(0, MAX_CACHED_EXPENSES);

          return {
            pages: safePages,
            pageParams: old?.pageParams ?? [0],
          };
        },
      );

      void setCacheEntry(expenseCacheKey, flattenedExpenses);
    },
    [bookId, expenseCacheKey, queryClient],
  );

  const infiniteQuery = useInfiniteQuery({
    queryKey: ["expenses", bookId],
    queryFn: async ({ pageParam = 0 }) => {
      const cachedExpenses = await getCacheEntry<Expense[]>(expenseCacheKey);

      if (!isOnline) {
        return pageParam === 0 ? cachedExpenses ?? [] : [];
      }

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      try {
        const { data, error } = await supabase
          .from("expenses")
          .select(`*, categories(name, icon, color)`)
          .eq("book_id", bookId)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;

        const userIds = [
          ...new Set(data.flatMap((expense) => [expense.created_by, expense.paid_by])),
        ];

        let profileMap = new Map<string, { display_name: string | null; email: string | null }>();

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", userIds);

          profileMap = new Map(profiles?.map((profile) => [profile.user_id, profile]) ?? []);
        }

        const mapped = data.map((expense) => ({
          ...expense,
          creator_profile: profileMap.get(expense.created_by) ?? null,
          payer_profile: profileMap.get(expense.paid_by) ?? null,
        })) as Expense[];

        await cacheFetchedExpenses(mapped, pageParam === 0);

        return mapped;
      } catch (error) {
        if (pageParam === 0 && cachedExpenses) {
          return cachedExpenses;
        }

        throw error;
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!isOnline) return undefined;
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    enabled: !!bookId && !!user,
  });

  const expenses = useMemo(
    () => infiniteQuery.data?.pages.flat() ?? [],
    [infiniteQuery.data]
  );

  const fetchNextPage = useCallback(() => {
    if (infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage();
    }
  }, [infiniteQuery]);

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
        const tempExpense: Expense = {
          id: crypto.randomUUID(),
          book_id: bookId,
          title: expense.title,
          amount: expense.amount,
          date: expense.date ?? new Date().toISOString().split("T")[0],
          category_id: expense.category_id ?? null,
          expense_type: expense.expense_type ?? "debit",
          payment_method: expense.payment_method ?? "cash",
          notes: expense.notes ?? null,
          tags: expense.tags ?? null,
          paid_by: user!.id,
          created_by: user!.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          categories: null,
          creator_profile: {
            display_name: profile?.display_name ?? null,
            email: profile?.email ?? null,
          },
          payer_profile: {
            display_name: profile?.display_name ?? null,
            email: profile?.email ?? null,
          },
          _offline: true,
        };

        updateExpenseState((pages) => [[tempExpense, ...(pages[0] ?? [])], ...pages.slice(1)]);

        await queueAction({
          type: "create_expense",
          payload: { ...expense, book_id: bookId },
          userId: user?.id,
        });

        return tempExpense;
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
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
      }
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      if (!isOnline) {
        updateExpenseState((pages) =>
          pages.map((page) => page.filter((expense) => expense.id !== expenseId)),
        );

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
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
      }
    },
  });

  return {
    expenses,
    isLoading: infiniteQuery.isLoading && isOnline && expenses.length === 0,
    createExpense,
    deleteExpense,
    fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage ?? false,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
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
