import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { withNetworkTimeout } from "@/lib/network";
import {
  getStoredExpenses,
  getStoredQueue,
  removeStoredQueueActions,
  setStoredExpenses,
  upsertStoredQueueAction,
  updateStoredExpenses,
} from "@/lib/offlineJournal";
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

async function putExpenses(bookId: string, expenses: Expense[]) {
  setStoredExpenses(bookId, expenses.slice(0, MAX_EXPENSES_CACHE));
  void db.expenses
    .put({
      id: bookId,
      expenses: expenses.slice(0, MAX_EXPENSES_CACHE),
      cachedAt: Date.now(),
    })
    .catch(() => {});
}

async function updateCachedExpenses(
  bookId: string,
  updater: (expenses: Expense[]) => Expense[],
) {
  const current = getStoredExpenses<Expense>(bookId);
  const next = updater(current);
  setStoredExpenses(bookId, next.slice(0, MAX_EXPENSES_CACHE));
  void db.expenses
    .put({
      id: bookId,
      expenses: next.slice(0, MAX_EXPENSES_CACHE),
      cachedAt: Date.now(),
    })
    .catch(() => {});
}

export function useExpenses(bookId: string) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const {
    isOnline,
    queueAction,
    cancelQueuedCreate,
    refreshPendingCount,
    syncNow,
  } = useOfflineSync();
  const [localExpenses, setLocalExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (!bookId) return;
    let active = true;
    db.expenses
      .get(bookId)
      .then((cached) => {
        if (!active) return;
        const cachedExpenses = (cached?.expenses ?? []) as Expense[];
        setLocalExpenses(
          cachedExpenses.length > 0
            ? cachedExpenses
            : getStoredExpenses<Expense>(bookId),
        );
      })
      .catch(() => {
        if (!active) return;
        setLocalExpenses(getStoredExpenses<Expense>(bookId));
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  const expensesQuery = useQuery({
    queryKey: ["expenses", bookId],
    queryFn: async () => {
      const cached = await db.expenses.get(bookId);
      const cachedExpenses =
        ((cached?.expenses ?? []) as Expense[]).length > 0
          ? ((cached?.expenses ?? []) as Expense[])
          : getStoredExpenses<Expense>(bookId);

      if (!user || !bookId) return [];
      if (!isOnline) return cachedExpenses;

      try {
        const { data, error } = await withNetworkTimeout(
          supabase
            .from("expenses")
            .select("*, categories(name, icon, color)")
            .eq("book_id", bookId)
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
          profileMap = new Map(profiles?.map((entry) => [entry.user_id, entry]) ?? []);
        }

        const remoteExpenses = (data ?? []).map((expense) => ({
          ...expense,
          creator_profile: profileMap.get(expense.created_by) ?? null,
          payer_profile: profileMap.get(expense.paid_by) ?? null,
          _offline: false,
        })) as Expense[];

        const offlineOnly = cachedExpenses.filter((expense) =>
          expense.id.startsWith("temp_"),
        );
        const merged = [
          ...offlineOnly,
          ...remoteExpenses.filter(
            (expense) => !offlineOnly.some((offline) => offline.id === expense.id),
          ),
        ];

        await putExpenses(bookId, merged);
        return merged;
      } catch {
        return cachedExpenses;
      }
    },
    enabled: !!user && !!bookId,
    staleTime: 30_000,
    placeholderData: localExpenses,
  });

  const expenses = (expensesQuery.data ?? []) as Expense[];

  const createExpense = useMutation({
    mutationFn: async (payload: ExpensePayload) => {
      const tempId = `temp_${crypto.randomUUID()}`;
      const optimistic = optimisticExpense(payload, user!.id, profile, tempId, !isOnline);

      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => [
        optimistic,
        ...(old ?? []),
      ]);
      await updateCachedExpenses(bookId, (current) => [optimistic, ...current]);
      await queueAction({
        type: "create_expense",
        payload: { ...payload, tempId },
        tempId,
        userId: user?.id,
      });
      if (isOnline) {
        void syncNow();
      }
      return { ...optimistic, _offline: true };
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", bookId] });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async (params: ExpenseUpdate) => {
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

      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) =>
        (old ?? []).map((expense) =>
          expense.id === params.expenseId ? { ...expense, ...patch } : expense,
        ),
      );
      await updateCachedExpenses(bookId, (current) =>
        current.map((expense) =>
          expense.id === params.expenseId ? { ...expense, ...patch } : expense,
        ),
      );

      const queued = getStoredQueue();
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
        upsertStoredQueueAction(nextAction);
        void db.syncQueue.put(nextAction).catch(() => {});
      } else {
        await queueAction({
          type: "update_expense",
          payload: { ...params, bookId },
          userId: user?.id,
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
      const deletedExpense = expenses.find((expense) => expense.id === expenseId);

      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) =>
        (old ?? []).filter((expense) => expense.id !== expenseId),
      );
      await updateCachedExpenses(bookId, (current) =>
        current.filter((expense) => expense.id !== expenseId),
      );

      if (expenseId.startsWith("temp_")) {
        await cancelQueuedCreate(expenseId);
        const queued = getStoredQueue();
        const relatedIds = queued
          .filter(
            (action) =>
              action.payload.expenseId === expenseId || action.tempId === expenseId,
          )
          .map((action) => action.id);
        if (relatedIds.length > 0) {
          removeStoredQueueActions(relatedIds);
          void db.syncQueue.bulkDelete(relatedIds).catch(() => {});
          await refreshPendingCount();
        }
        return;
      }

      if (deletedExpense) {
        await db.deletedExpenses.put({
          id: expenseId,
          bookId,
          data: deletedExpense as unknown as Record<string, unknown>,
          deletedAt: Date.now(),
        });
      }

      await queueAction({
        type: "delete_expense",
        payload: { expenseId },
        userId: user?.id,
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
      const deleted = await db.deletedExpenses.get(expenseId);
      if (!deleted) return;

      const expense = deleted.data as Expense;
      queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => {
        const current = old ?? [];
        if (current.some((entry) => entry.id === expense.id)) return current;
        return [{ ...expense, _offline: !isOnline }, ...current];
      });
      await updateCachedExpenses(bookId, (current) => {
        if (current.some((entry) => entry.id === expense.id)) return current;
        return [{ ...expense, _offline: !isOnline }, ...current];
      });
      await db.deletedExpenses.delete(expenseId);

      if (!isOnline) {
        const queued = getStoredQueue();
        const pendingDelete = queued.find(
          (action) =>
            action.type === "delete_expense" &&
            action.payload.expenseId === expenseId,
        );
        if (pendingDelete) {
          removeStoredQueueActions([pendingDelete.id]);
          void db.syncQueue.delete(pendingDelete.id).catch(() => {});
          await refreshPendingCount();
          return;
        }

        await queueAction({
          type: "create_expense",
          payload: {
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
          },
          tempId: expense.id,
          userId: user?.id,
        });
        return;
      }

      await queueAction({
        type: "create_expense",
        payload: {
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
        },
        tempId: expense.id,
        userId: user?.id,
      });
      if (isOnline) {
        void syncNow();
      }
    },
    onSuccess: () => {
      toast.success("Expense restored");
    },
  });

  const fetchNextPage = async () => {
    if (!isOnline || !bookId) return;
    const currentCount = expenses.length;
    const { data, error } = await withNetworkTimeout(
      supabase
        .from("expenses")
        .select("*, categories(name, icon, color)")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .range(currentCount, currentCount + PAGE_SIZE - 1),
    );
    if (error || !data?.length) return;

    queryClient.setQueryData(["expenses", bookId], (old: Expense[] | undefined) => [
      ...(old ?? []),
      ...(data as Expense[]),
    ]);
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
        return (cached?.data ?? DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
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
        return (cached?.data ?? DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
      }
    },
    staleTime: 300_000,
    placeholderData: localCategories,
  });
}
