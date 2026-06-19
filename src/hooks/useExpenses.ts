import { supabase } from "@/integrations/supabase/client";
import { type TablesUpdate } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  book_id?: string | null;
  created_by?: string | null;
  created_at?: string;
}

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
  categories: Pick<Category, "name" | "icon" | "color"> | null;
  creator_profile?: {
    display_name: string | null;
    email: string | null;
  } | null;
  payer_profile?: {
    display_name: string | null;
    email: string | null;
  } | null;
}

type ExpensePayload = {
  book_id: string;
  title: string;
  amount: number;
  date?: string;
  category_id?: string;
  category?: Pick<Category, "name" | "icon" | "color"> | null;
  expense_type?: string;
  payment_method?: string;
  notes?: string;
  tags?: string[];
};

type ExpenseUpdate = {
  expenseId: string;
  title?: string;
  amount?: number;
  date?: string;
  category_id?: string;
  category?: Pick<Category, "name" | "icon" | "color"> | null;
  expense_type?: string;
  payment_method?: string;
  notes?: string;
  tags?: string[];
};

const PAGE_SIZE = 20;
const MAX_EXPENSES = 500;

function getTimestamp(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortExpensesByDateDesc(expenses: Expense[]) {
  return [...expenses].sort((a, b) => {
    const dateDiff = getTimestamp(b.date) - getTimestamp(a.date);
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = getTimestamp(b.created_at) - getTimestamp(a.created_at);
    if (createdDiff !== 0) return createdDiff;
    return b.id.localeCompare(a.id);
  });
}

function assertOnline(isOnline: boolean) {
  if (!isOnline) {
    throw new Error("You're offline. Connect to the internet to continue.");
  }
}

function getCategoryCacheId(userId?: string) {
  return `categories:${userId || "_anonymous"}`;
}

function sortCategories(categories: Category[]) {
  return categories
    .map((category) => ({
      ...category,
      name:
        category.name.trim().toLowerCase() === "miscellaneous"
          ? "Other"
          : category.name,
    }))
    .sort((a, b) => {
      if (a.is_default !== b.is_default) {
        return a.is_default ? -1 : 1;
      }
      const aIsOther = a.name.trim().toLowerCase() === "other";
      const bIsOther = b.name.trim().toLowerCase() === "other";
      if (aIsOther !== bIsOther) {
        return aIsOther ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
}

function getCustomCategoryColor(name: string) {
  const palette = [
    "#0F766E",
    "#2563EB",
    "#B45309",
    "#BE123C",
    "#7C3AED",
    "#0891B2",
    "#4F46E5",
    "#16A34A",
  ];
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

async function fetchExpensesPage(bookId: string, from: number, to: number) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*, categories(name, icon, color)")
    .eq("book_id", bookId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const userIds = [
    ...new Set(
      (data ?? []).flatMap((expense) => [expense.created_by, expense.paid_by]),
    ),
  ].filter(Boolean);

  let profileMap = new Map<
    string,
    { display_name: string | null; email: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds);
    profileMap = new Map(profiles?.map((entry) => [entry.user_id, entry]) ?? []);
  }

  return (data ?? []).map((expense) => ({
    ...expense,
    creator_profile: profileMap.get(expense.created_by) ?? null,
    payer_profile: profileMap.get(expense.paid_by) ?? null,
  })) as Expense[];
}

export function useExpenses(bookId: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineSync();
  const userId = user?.id;

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      if (!user || !bookId || !userId) return [];
      const page = await fetchExpensesPage(bookId, 0, PAGE_SIZE - 1);
      return sortExpensesByDateDesc(page);
    },
    enabled: !!user && !!bookId && !!userId && isOnline,
  });

  // Accurate book totals across ALL expenses (not just the loaded page).
  const totalsQuery = useQuery({
    queryKey: ["book-detail-totals", bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, expense_type")
        .eq("book_id", bookId);
      if (error) throw error;
      let income = 0;
      let expense = 0;
      for (const row of data ?? []) {
        const amount = Number(row.amount) || 0;
        if (row.expense_type === "credit") income += amount;
        else expense += amount;
      }
      return { totalIncome: income, totalExpense: expense };
    },
    enabled: !!user && !!bookId && isOnline,
  });

  // Realtime: any change to this book's expenses refreshes list + totals.
  useEffect(() => {
    if (!bookId || !user) return;
    const channel = supabase
      .channel(`expenses-${bookId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `book_id=eq.${bookId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
          queryClient.invalidateQueries({
            queryKey: ["book-detail-totals", bookId],
          });
          queryClient.invalidateQueries({ queryKey: ["book-totals"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, user, queryClient]);

  const expenses = (expensesQuery.data ?? []) as Expense[];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    queryClient.invalidateQueries({ queryKey: ["book-detail-totals", bookId] });
    queryClient.invalidateQueries({ queryKey: ["book-totals"] });
  };

  const createExpense = useMutation({
    mutationFn: async (payload: ExpensePayload) => {
      assertOnline(isOnline);
      const uid = user?.id;
      if (!uid) throw new Error("User ID not available. Please log in again.");

      const { data, error } = await supabase
        .from("expenses")
        .insert({
          book_id: payload.book_id,
          title: payload.title,
          amount: payload.amount,
          date: payload.date ?? new Date().toISOString(),
          category_id: payload.category_id || null,
          expense_type: payload.expense_type ?? "debit",
          payment_method: payload.payment_method ?? "cash",
          notes: payload.notes ?? null,
          tags: payload.tags ?? [],
          paid_by: uid,
          created_by: uid,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAll,
  });

  const updateExpense = useMutation({
    mutationFn: async (params: ExpenseUpdate) => {
      assertOnline(isOnline);
      const update: TablesUpdate<"expenses"> = {};
      if (params.title !== undefined) update.title = params.title;
      if (params.amount !== undefined) update.amount = params.amount;
      if (params.date !== undefined) update.date = params.date;
      if (params.category_id !== undefined)
        update.category_id = params.category_id || null;
      if (params.expense_type !== undefined)
        update.expense_type = params.expense_type;
      if (params.payment_method !== undefined)
        update.payment_method = params.payment_method;
      if (params.notes !== undefined) update.notes = params.notes;
      if (params.tags !== undefined) update.tags = params.tags;

      const { error } = await supabase
        .from("expenses")
        .update(update)
        .eq("id", params.expenseId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId);
      if (error) throw error;
      return expenseId;
    },
    onMutate: (expenseId: string) => {
      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) =>
          (old ?? []).filter((expense) => expense.id !== expenseId),
      );
    },
    onSuccess: () => {
      toast("Expense deleted");
    },
    onSettled: invalidateAll,
  });

  const fetchNextPage = async () => {
    if (!isOnline || !bookId) return;
    const currentCount = expenses.length;
    if (currentCount >= MAX_EXPENSES) return;
    try {
      const page = await fetchExpensesPage(
        bookId,
        currentCount,
        currentCount + PAGE_SIZE - 1,
      );
      if (page.length === 0) return;
      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) =>
          sortExpensesByDateDesc([...(old ?? []), ...page]),
      );
    } catch {
      // ignore pagination errors
    }
  };

  return {
    expenses,
    isLoading: expensesQuery.isLoading,
    isError: expensesQuery.isError,
    totalIncome: totalsQuery.data?.totalIncome ?? 0,
    totalExpense: totalsQuery.data?.totalExpense ?? 0,
    createExpense,
    updateExpense,
    deleteExpense,
    fetchNextPage,
    hasNextPage: isOnline && expenses.length >= PAGE_SIZE,
    isFetchingNextPage: false,
  };
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: "groceries", name: "Groceries", icon: "shopping-bag", color: "#10B981", is_default: true },
  { id: "transport", name: "Transport", icon: "truck", color: "#3B82F6", is_default: true },
  { id: "bills", name: "Bills", icon: "credit-card", color: "#F97316", is_default: true },
  { id: "entertainment", name: "Entertainment", icon: "film", color: "#8B5CF6", is_default: true },
  { id: "health", name: "Health", icon: "heart", color: "#EF4444", is_default: true },
  { id: "other", name: "Other", icon: "tag", color: "#6B7280", is_default: true },
];

export function useCategories() {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const cacheId = getCategoryCacheId(userId);

  const categoriesQuery = useQuery({
    queryKey: ["categories", cacheId],
    queryFn: async () => {
      if (!userId) return DEFAULT_CATEGORIES;
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .or(`is_default.eq.true,created_by.eq.${userId}`)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return sortCategories((data ?? DEFAULT_CATEGORIES) as Category[]);
    },
    enabled: !!userId && isOnline,
    placeholderData: DEFAULT_CATEGORIES,
    staleTime: 300_000,
  });

  const createCategory = useMutation({
    mutationFn: async (rawName: string) => {
      const name = rawName.trim();
      if (!name) throw new Error("Category name is required");
      assertOnline(isOnline);

      const existing = (
        queryClient.getQueryData(["categories", cacheId]) as Category[] | undefined
      )?.find(
        (category) => category.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing;

      if (!userId) throw new Error("User not available. Please sign in again.");

      const { data, error } = await supabase
        .from("categories")
        .insert({
          name,
          color: getCustomCategoryColor(name),
          icon: "tag",
          is_default: false,
          book_id: null,
          created_by: userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", cacheId] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      const current =
        (queryClient.getQueryData(["categories", cacheId]) as Category[]) ?? [];
      const category = current.find((entry) => entry.id === categoryId);
      if (!category) return categoryId;
      if (category.is_default)
        throw new Error("Default categories cannot be deleted.");
      assertOnline(isOnline);

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);
      if (error) throw error;
      return categoryId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", cacheId] });
    },
  });

  return {
    ...categoriesQuery,
    data: (categoriesQuery.data ?? DEFAULT_CATEGORIES) as Category[],
    createCategory,
    deleteCategory,
  };
}
