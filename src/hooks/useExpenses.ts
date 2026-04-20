import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { isOfflineLikeError, withNetworkTimeout } from "@/lib/network";
import {
  getCurrentUserId,
  getStoredExpenses,
  setStoredExpenses,
} from "@/lib/offlineJournal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getUserId, useAuth } from "./useAuth";
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
  payer_profile?: {
    display_name: string | null;
    email: string | null;
  } | null;
  _offline?: boolean;
}

type ExpensePayload = {
  book_id: string;
  title: string;
  amount: number;
  date?: string;
  category_id?: string;
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
  expense_type?: string;
  payment_method?: string;
  notes?: string;
  tags?: string[];
};

const MAX_EXPENSES_CACHE = 50;
const PAGE_SIZE = 20;

function optimisticExpense(
  payload: ExpensePayload,
  userId: string,
  profile: { display_name: string | null; email: string | null } | null,
  tempId: string,
  offline = true,
): Expense {
  const now = new Date().toISOString();
  return {
    id: tempId,
    book_id: payload.book_id,
    title: payload.title,
    amount: payload.amount,
    date: payload.date ?? now.split("T")[0],
    category_id: payload.category_id ?? null,
    expense_type: payload.expense_type ?? "debit",
    payment_method: payload.payment_method ?? "cash",
    notes: payload.notes ?? null,
    tags: payload.tags ?? [],
    paid_by: userId,
    created_by: userId,
    created_at: now,
    updated_at: now,
    categories: null,
    creator_profile: {
      display_name: profile?.display_name ?? null,
      email: profile?.email ?? null,
    },
    payer_profile: {
      display_name: profile?.display_name ?? null,
      email: profile?.email ?? null,
    },
    _offline: offline,
  };
}

async function putExpenses(
  bookId: string,
  expenses: Expense[],
  userId?: string,
) {
  setStoredExpenses(bookId, expenses.slice(0, MAX_EXPENSES_CACHE), userId);
  await db.expenses.put({
    id: bookId,
    expenses: expenses.slice(0, MAX_EXPENSES_CACHE),
    userId: userId || getCurrentUserId(),
    cachedAt: Date.now(),
  });
}

async function updateCachedExpenses(
  bookId: string,
  updater: (expenses: Expense[]) => Expense[],
  userId?: string,
) {
  const current = getStoredExpenses<Expense>(bookId, userId);
  const next = updater(current);
  setStoredExpenses(bookId, next.slice(0, MAX_EXPENSES_CACHE), userId);
  await db.expenses.put({
    id: bookId,
    expenses: next.slice(0, MAX_EXPENSES_CACHE),
    userId: userId || getCurrentUserId(),
    cachedAt: Date.now(),
  });
}

async function getCachedExpenses(
  bookId: string,
  userId?: string,
): Promise<Expense[]> {
  try {
    const uid = userId || getCurrentUserId();
    const cached = await db.expenses.get(bookId);
    // Only return if userId matches (for isolation)
    if (
      cached &&
      cached.userId === uid &&
      Array.isArray(cached.expenses) &&
      cached.expenses.length > 0
    ) {
      return cached.expenses as Expense[];
    }
  } catch {
    // IndexedDB may fail
  }
  return getStoredExpenses<Expense>(bookId, userId);
}

export function useExpenses(bookId: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const {
    isOnline,
    queueAction,
    cancelQueuedCreate,
    getQueuedActions,
    removeQueuedActions,
    refreshPendingCount,
    syncNow,
    upsertQueuedAction,
  } = useOfflineSync();
  const [localExpenses, setLocalExpenses] = useState<Expense[]>([]);
  const userId = user?.id || getUserId();

  // Immediate offline -> cache fallback
  useEffect(() => {
    if (!bookId || !userId) return;
    let active = true;

    getCachedExpenses(bookId, userId).then((expenses) => {
      if (active) setLocalExpenses(expenses);
    });

    return () => {
      active = false;
    };
  }, [bookId, userId]);

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      const cachedExpenses = await getCachedExpenses(bookId, userId);

      if (!user || !bookId || !userId) return [];

      // CRITICAL FIX: Immediately return cached data when offline
      // This prevents the first-time offline switching failure
      if (!isOnline) {
        return cachedExpenses.sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          if (bTime !== aTime) return bTime - aTime; // Newest first
          return b.id.localeCompare(a.id); // Tie-breaker by ID
        });
      }

      try {
        const { data, error } = await withNetworkTimeout(
          supabase
            .from("expenses")
            .select("*, categories(name, icon, color)")
            .eq("book_id", bookId)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(MAX_EXPENSES_CACHE),
        );
        if (error) throw error;

        const userIds = [
          ...new Set(
            (data ?? []).flatMap((expense) => [
              expense.created_by,
              expense.paid_by,
            ]),
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
          profileMap = new Map(
            profiles?.map((entry) => [entry.user_id, entry]) ?? [],
          );
        }

        // Store complete expense data with all relationships
        const remoteExpenses = (data ?? []).map((expense) => ({
          ...expense,
          creator_profile: profileMap.get(expense.created_by) ?? null,
          payer_profile: profileMap.get(expense.paid_by) ?? null,
          _offline: false,
        })) as Expense[];

        // Merge offline-created expenses that haven't synced yet
        const offlineOnly = cachedExpenses.filter((expense) =>
          expense.id.startsWith("temp_"),
        );
        const merged = [
          ...offlineOnly,
          ...remoteExpenses.filter(
            (expense) =>
              !offlineOnly.some((offline) => offline.id === expense.id),
          ),
        ].sort((a, b) => {
          // Sort by updated_at/created_at (newest first), then by ID for tie-breaking
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          if (bTime !== aTime) return bTime - aTime; // Newest first
          return b.id.localeCompare(a.id); // Tie-breaker by ID
        });

        await putExpenses(bookId, merged, userId);
        return merged;
      } catch (err) {
        if (isOfflineLikeError(err)) {
          return cachedExpenses.sort((a, b) => {
            const aTime = new Date(a.updated_at || a.created_at).getTime();
            const bTime = new Date(b.updated_at || b.created_at).getTime();
            if (bTime !== aTime) return bTime - aTime; // Newest first
            return b.id.localeCompare(a.id); // Tie-breaker by ID
          });
        }
        return cachedExpenses.sort((a, b) => {
          const aTime = new Date(a.updated_at || a.created_at).getTime();
          const bTime = new Date(b.updated_at || b.created_at).getTime();
          if (bTime !== aTime) return bTime - aTime; // Newest first
          return b.id.localeCompare(a.id); // Tie-breaker by ID
        });
      }
    },
    enabled: !!user && !!bookId && !!userId,
    staleTime: 30_000,
    placeholderData: localExpenses,
  });

  const expenses = (expensesQuery.data ?? []) as Expense[];

  const createExpense = useMutation({
    mutationFn: async (payload: ExpensePayload) => {
      const tempId = `temp_${crypto.randomUUID()}`;
      const uid = user?.id || getUserId();

      if (!uid) {
        throw new Error("User ID not available. Please log in again.");
      }

      const optimistic = optimisticExpense(payload, uid, profile, tempId, true);

      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) => [optimistic, ...(old ?? [])],
      );
      await updateCachedExpenses(
        bookId,
        (current) => [optimistic, ...current],
        uid,
      );
      await queueAction({
        type: "create_expense",
        payload: { ...payload, tempId, paid_by: uid, created_by: uid },
        tempId,
        userId: uid,
      });
      if (isOnline) {
        void syncNow();
      }
      return optimistic;
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async (params: ExpenseUpdate) => {
      const uid = user?.id || getUserId();
      const patch = {
        title: params.title,
        amount: params.amount,
        date: params.date,
        category_id: params.category_id ?? null,
        expense_type: params.expense_type,
        payment_method: params.payment_method,
        notes: params.notes,
        tags: params.tags,
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) =>
          (old ?? []).map((expense) =>
            expense.id === params.expenseId
              ? { ...expense, ...patch }
              : expense,
          ),
      );
      await updateCachedExpenses(
        bookId,
        (current) =>
          current.map((expense) =>
            expense.id === params.expenseId
              ? { ...expense, ...patch }
              : expense,
          ),
        uid,
      );

      const queued = await getQueuedActions();
      const pendingCreate = queued.find(
        (action) =>
          action.type === "create_expense" &&
          (action.tempId === params.expenseId ||
            action.payload.tempId === params.expenseId),
      );

      if (pendingCreate) {
        const nextAction = {
          ...pendingCreate,
          payload: {
            ...pendingCreate.payload,
            ...params,
            tempId: params.expenseId,
          },
        };
        await upsertQueuedAction(nextAction);
      } else {
        await queueAction({
          type: "update_expense",
          payload: { ...params, bookId },
          userId: uid,
        });
      }

      if (isOnline) {
        void syncNow();
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const uid = user?.id || getUserId();
      const deletedExpense = expenses.find(
        (expense) => expense.id === expenseId,
      );

      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) =>
          (old ?? []).filter((expense) => expense.id !== expenseId),
      );
      await updateCachedExpenses(
        bookId,
        (current) => current.filter((expense) => expense.id !== expenseId),
        uid,
      );

      if (expenseId.startsWith("temp_")) {
        await cancelQueuedCreate(expenseId);
        const queued = await getQueuedActions();
        const relatedIds = queued
          .filter(
            (action) =>
              action.payload.expenseId === expenseId ||
              action.tempId === expenseId,
          )
          .map((action) => action.id);
        if (relatedIds.length > 0) {
          await removeQueuedActions(relatedIds);
          await refreshPendingCount();
        }
        return;
      }

      if (deletedExpense) {
        await db.deletedExpenses.put({
          id: expenseId,
          bookId,
          userId: uid,
          data: deletedExpense as unknown as Record<string, unknown>,
          deletedAt: Date.now(),
        });
      }

      await queueAction({
        type: "delete_expense",
        payload: { expenseId },
        userId: uid,
      });
      if (isOnline) {
        void syncNow();
      }
    },
    onSuccess: (_result, expenseId) => {
      if (expenseId.startsWith("temp_")) return;
      toast("Expense deleted", {
        action: {
          label: "Undo",
          onClick: () => restoreExpense.mutate(expenseId),
        },
        duration: 4000,
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    },
  });

  const restoreExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const uid = user?.id || getUserId();
      const deleted = await db.deletedExpenses.get(expenseId);
      if (!deleted) return;

      const expense = deleted.data as Expense;
      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) => {
          const current = old ?? [];
          if (current.some((entry) => entry.id === expense.id)) return current;
          return [{ ...expense, _offline: !isOnline }, ...current];
        },
      );
      await updateCachedExpenses(
        bookId,
        (current) => {
          if (current.some((entry) => entry.id === expense.id)) return current;
          return [{ ...expense, _offline: !isOnline }, ...current];
        },
        uid,
      );
      await db.deletedExpenses.delete(expenseId);

      const restorePayload = {
        book_id: expense.book_id,
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
        category_id: expense.category_id ?? undefined,
        expense_type: expense.expense_type,
        payment_method: expense.payment_method ?? undefined,
        notes: expense.notes ?? undefined,
        tags: expense.tags ?? undefined,
        paid_by: expense.paid_by,
        created_by: expense.created_by,
        tempId: expense.id,
      };

      if (!isOnline) {
        const queued = await getQueuedActions();
        const pendingDelete = queued.find(
          (action) =>
            action.type === "delete_expense" &&
            action.payload.expenseId === expenseId,
        );
        if (pendingDelete) {
          await removeQueuedActions([pendingDelete.id]);
          await refreshPendingCount();
          return;
        }

        await queueAction({
          type: "create_expense",
          payload: restorePayload,
          tempId: expense.id,
          userId: uid,
        });
        return;
      }

      await queueAction({
        type: "create_expense",
        payload: restorePayload,
        tempId: expense.id,
        userId: uid,
      });
      void syncNow();
    },
    onSuccess: () => {
      toast.success("Expense restored");
    },
  });

  const fetchNextPage = async () => {
    if (!isOnline || !bookId) return;
    const currentCount = expenses.length;
    try {
      const { data, error } = await withNetworkTimeout(
        supabase
          .from("expenses")
          .select("*, categories(name, icon, color)")
          .eq("book_id", bookId)
          .order("created_at", { ascending: false })
          .range(currentCount, currentCount + PAGE_SIZE - 1),
      );
      if (error || !data?.length) return;

      queryClient.setQueryData(
        ["expenses", bookId],
        (old: Expense[] | undefined) => [
          ...(old ?? []),
          ...(data as Expense[]),
        ],
      );
    } catch {
      // Ignore pagination errors
    }
  };

  return {
    expenses,
    isLoading: expensesQuery.isLoading && expenses.length === 0,
    createExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    fetchNextPage,
    hasNextPage: isOnline && expenses.length >= PAGE_SIZE,
    isFetchingNextPage: false,
  };
}

const DEFAULT_CATEGORIES = [
  {
    id: "groceries",
    name: "Groceries",
    icon: "shopping-bag",
    color: "#10B981",
    is_default: true,
  },
  {
    id: "transport",
    name: "Transport",
    icon: "truck",
    color: "#3B82F6",
    is_default: true,
  },
  {
    id: "bills",
    name: "Bills",
    icon: "credit-card",
    color: "#F97316",
    is_default: true,
  },
  {
    id: "entertainment",
    name: "Entertainment",
    icon: "film",
    color: "#8B5CF6",
    is_default: true,
  },
  {
    id: "health",
    name: "Health",
    icon: "heart",
    color: "#EF4444",
    is_default: true,
  },
  {
    id: "other",
    name: "Other",
    icon: "tag",
    color: "#6B7280",
    is_default: true,
  },
];

export function useCategories() {
  const { isOnline } = useOfflineSync();
  const [localCategories, setLocalCategories] = useState<
    typeof DEFAULT_CATEGORIES
  >([]);

  useEffect(() => {
    let active = true;
    db.categories
      .get("default")
      .then((cached) => {
        if (!active) return;
        setLocalCategories(
          (cached?.data ?? DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES,
        );
      })
      .catch(() => {
        if (!active) return;
        setLocalCategories(DEFAULT_CATEGORIES);
      });
    return () => {
      active = false;
    };
  }, []);

  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const cached = await db.categories.get("default");
      if (!isOnline) {
        return (cached?.data ??
          DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
      }

      try {
        const { data, error } = await withNetworkTimeout(
          supabase
            .from("categories")
            .select("*")
            .eq("is_default", true)
            .order("name"),
        );
        if (error) throw error;

        if (data) {
          await db.categories.put({
            id: "default",
            data,
            cachedAt: Date.now(),
          });
          setLocalCategories(data as typeof DEFAULT_CATEGORIES);
        }
        return (data ?? DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
      } catch {
        return (cached?.data ??
          DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
      }
    },
    staleTime: 300_000,
    placeholderData: localCategories,
  });
}
