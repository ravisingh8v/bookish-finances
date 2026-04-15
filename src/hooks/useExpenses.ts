import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";
import { getCacheEntry, setCacheEntry } from "@/lib/offlineStore";
import { useEffect, useCallback, useMemo } from "react";

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

export function useExpenses(bookId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, queueAction } = useOfflineSync();

  const infiniteQuery = useInfiniteQuery({
    queryKey: ["expenses", bookId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("expenses")
        .select(`*, categories(name, icon, color)`)
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      // Fetch profiles for all unique user ids
      const userIds = [...new Set(data.flatMap((e) => [e.created_by, e.paid_by]))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      const mapped = data.map((e) => ({
        ...e,
        creator_profile: profileMap.get(e.created_by) ?? null,
        payer_profile: profileMap.get(e.paid_by) ?? null,
      })) as Expense[];

      // Cache first page for offline
      if (pageParam === 0) {
        setCacheEntry(`expenses:${bookId}`, mapped).catch(() => {});
      }

      return mapped;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    enabled: !!bookId && !!user && isOnline,
  });

  // Load cached expenses when offline
  useEffect(() => {
    if (!isOnline && user && bookId) {
      getCacheEntry<Expense[]>(`expenses:${bookId}`).then((cached) => {
        if (cached) {
          queryClient.setQueryData(["expenses", bookId], {
            pages: [cached],
            pageParams: [0],
          });
        }
      }).catch(() => {});
    }
  }, [isOnline, user, bookId, queryClient]);

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
        await queueAction({
          type: "create_expense",
          payload: { ...expense, book_id: bookId },
          userId: user?.id,
        });
        // Optimistically add to list
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
          creator_profile: null,
          payer_profile: null,
          _offline: true,
        };
        queryClient.setQueryData(["expenses", bookId], (old: any) => {
          const pages = old?.pages ?? [];
          return {
            pages: [[tempExpense, ...(pages[0] ?? [])], ...pages.slice(1)],
            pageParams: old?.pageParams ?? [0],
          };
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
        await queueAction({
          type: "delete_expense",
          payload: { expenseId },
          userId: user?.id,
        });
        // Optimistically remove
        queryClient.setQueryData(["expenses", bookId], (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: Expense[]) =>
              page.filter((e) => e.id !== expenseId)
            ),
          };
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
    isLoading: infiniteQuery.isLoading && isOnline,
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
