import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type TablesUpdate } from "@/integrations/supabase/types";
import { createSyncActionId, db, type SyncAction } from "@/lib/db";
import {
  countPersistedQueue,
  getPersistedQueue,
  getStoredExpenses,
  removePersistedQueueActions,
  removeStoredBook,
  removeStoredExpenseBucket,
  renameStoredExpenseBucket,
  setStoredExpenses,
  updateStoredBook,
  upsertPersistedQueueAction,
  upsertStoredBook,
} from "@/lib/offlineJournal";
import { useAuth } from "./useAuth";
import { useOnlineStatus } from "./useOnlineStatus";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface OfflineSyncContextType {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  isSaving: boolean;
  beginWrite: () => void;
  endWrite: () => void;
  refreshPendingCount: () => Promise<void>;
  queueAction: (
    action: Omit<SyncAction, "id" | "createdAt" | "retryCount">,
  ) => Promise<void>;
  getQueuedActions: () => Promise<SyncAction[]>;
  upsertQueuedAction: (action: SyncAction) => Promise<void>;
  removeQueuedActions: (actionIds: string[]) => Promise<void>;
  cancelQueuedCreate: (tempId: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

type CreateBookPayload = {
  name: string;
  description?: string;
  currency?: string;
  color?: string;
  icon?: string;
  tempId?: string;
};

type UpdateBookPayload = {
  bookId: string;
  name?: string;
  description?: string;
  currency?: string;
  color?: string;
  icon?: string;
};

type DeleteBookPayload = {
  bookId: string;
};

type CreateExpensePayload = {
  book_id: string;
  title: string;
  amount: number;
  date?: string;
  category_id?: string;
  expense_type?: string;
  payment_method?: string;
  notes?: string;
  tags?: string[];
  paid_by?: string;
  created_by?: string;
  tempId?: string;
};

type UpdateExpensePayload = {
  expenseId: string;
  bookId: string;
  title?: string;
  amount?: number;
  date?: string;
  category_id?: string;
  expense_type?: string;
  payment_method?: string;
  notes?: string;
  tags?: string[];
};

type DeleteExpensePayload = {
  expenseId: string;
};

type AddMemberPayload = {
  bookId: string;
  userId?: string;
  email?: string;
  role: string;
};

type RemoveMemberPayload = {
  memberId: string;
};

type UpdateMemberRolePayload = {
  memberId: string;
  role: string;
};

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(
  undefined,
);

const MAX_RETRY = 5;
const RETRY_BACKOFF_BASE = 2000;

function getActionIdentity(action: Pick<SyncAction, "type" | "payload">) {
  switch (action.type) {
    case "update_book":
    case "delete_book":
      return `book:${String(action.payload.bookId ?? "")}`;
    case "update_expense":
    case "delete_expense":
      return `expense:${String(action.payload.expenseId ?? "")}`;
    case "update_member_role":
    case "remove_member":
      return `member:${String(action.payload.memberId ?? "")}`;
    default:
      return null;
  }
}

function mergeQueuedAction(existing: SyncAction, incoming: SyncAction) {
  switch (incoming.type) {
    case "update_book":
    case "update_expense":
    case "update_member_role":
      if (existing.type !== incoming.type) {
        return null;
      }

      return {
        ...existing,
        payload: {
          ...existing.payload,
          ...incoming.payload,
        },
        userId: incoming.userId ?? existing.userId,
        lastAttempt: undefined,
        retryCount: 0,
      };
    case "delete_book":
      if (existing.type === "delete_book") {
        return existing;
      }

      if (existing.type === "update_book") {
        return {
          ...incoming,
          id: existing.id,
          createdAt: existing.createdAt,
          retryCount: 0,
          lastAttempt: undefined,
        };
      }
      return null;
    case "delete_expense":
      if (existing.type === "delete_expense") {
        return existing;
      }

      if (existing.type === "update_expense") {
        return {
          ...incoming,
          id: existing.id,
          createdAt: existing.createdAt,
          retryCount: 0,
          lastAttempt: undefined,
        };
      }
      return null;
    case "remove_member":
      if (existing.type === "remove_member") {
        return existing;
      }

      if (existing.type === "update_member_role") {
        return {
          ...incoming,
          id: existing.id,
          createdAt: existing.createdAt,
          retryCount: 0,
          lastAttempt: undefined,
        };
      }
      return null;
    default:
      return null;
  }
}

async function replaceBookReference(tempBookId: string, realBookId: string) {
  if (tempBookId === realBookId) return;

  const tempBook = await db.books.get(tempBookId);
  if (tempBook) {
    await db.books.delete(tempBookId);
    await db.books.put({
      ...tempBook,
      id: realBookId,
      data: {
        ...(tempBook.data as Record<string, unknown>),
        id: realBookId,
        _offline: false,
      },
      cachedAt: Date.now(),
    });
  }

  const tempExpenses = await db.expenses.get(tempBookId);
  if (tempExpenses) {
    await db.expenses.delete(tempBookId);
    await db.expenses.put({
      ...tempExpenses,
      id: realBookId,
      expenses: tempExpenses.expenses.map((expense) => ({
        ...(expense as Record<string, unknown>),
        book_id: realBookId,
      })),
      cachedAt: Date.now(),
    });
  }

  updateStoredBook<Record<string, unknown> & { id: string }>(tempBookId, (book) => ({
    ...book,
    id: realBookId,
    _offline: false,
  }));
  renameStoredExpenseBucket<Record<string, unknown> & { book_id?: string }>(
    tempBookId,
    realBookId,
  );

  const queuedActions = await getPersistedQueue();
  await Promise.all(
    queuedActions.map(async (action) => {
      let changed = false;
      const payload = { ...action.payload };

      if (action.tempId === tempBookId) {
        action.tempId = realBookId;
        changed = true;
      }

      if (payload.bookId === tempBookId) {
        payload.bookId = realBookId;
        changed = true;
      }

      if (payload.book_id === tempBookId) {
        payload.book_id = realBookId;
        changed = true;
      }

      if (payload.tempId === tempBookId && action.type === "create_book") {
        payload.tempId = realBookId;
        changed = true;
      }

      if (changed) {
        await upsertPersistedQueueAction({
          ...action,
          payload,
        });
      }
    }),
  );
}

async function resolveMemberUserId(payload: AddMemberPayload) {
  if (payload.userId) return payload.userId;
  if (!payload.email) {
    throw new Error("Missing member identity");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", payload.email.toLowerCase().trim())
    .single();

  if (error || !data?.user_id) {
    throw new Error("No user found with that email");
  }

  return data.user_id;
}

async function processAction(action: SyncAction, userId: string): Promise<boolean> {
  try {
    switch (action.type) {
      case "create_book": {
        const payload = action.payload as CreateBookPayload;
        const { data, error } = await supabase
          .from("expense_books")
          .insert({
            name: payload.name,
            description: payload.description ?? null,
            currency: payload.currency,
            color: payload.color,
            icon: payload.icon,
            created_by: userId,
          })
          .select()
          .single();
        if (error) throw error;

        const { error: memberError } = await supabase
          .from("book_members")
          .insert({ book_id: data.id, user_id: userId, role: "owner" });
        if (memberError) throw memberError;

        if (payload.tempId) {
          await replaceBookReference(payload.tempId, data.id);
        }

        await db.books.put({
          id: data.id,
          data: {
            ...data,
            members: [{ user_id: userId, role: "owner" }],
            my_access: [{ user_id: userId, role: "owner" }],
            _offline: false,
          },
          cachedAt: Date.now(),
        });
        upsertStoredBook({
          ...data,
          members: [{ user_id: userId, role: "owner" }],
          my_access: [{ user_id: userId, role: "owner" }],
          _offline: false,
        });
        break;
      }
      case "update_book": {
        const payload = action.payload as UpdateBookPayload;
        if (payload.bookId.startsWith("temp_")) return false;

        const { error } = await supabase
          .from("expense_books")
          .update({
            name: payload.name,
            description: payload.description,
            currency: payload.currency,
            color: payload.color,
            icon: payload.icon,
          })
          .eq("id", payload.bookId);
        if (error) throw error;
        break;
      }
      case "delete_book": {
        const payload = action.payload as DeleteBookPayload;
        if (payload.bookId.startsWith("temp_")) {
          await db.books.delete(payload.bookId);
          await db.expenses.delete(payload.bookId);
          removeStoredBook(payload.bookId);
          removeStoredExpenseBucket(payload.bookId);
          return true;
        }

        const { error } = await supabase
          .from("expense_books")
          .delete()
          .eq("id", payload.bookId);
        if (error) throw error;

        await db.books.delete(payload.bookId);
        await db.expenses.delete(payload.bookId);
        removeStoredBook(payload.bookId);
        removeStoredExpenseBucket(payload.bookId);
        break;
      }
      case "create_expense": {
        const payload = action.payload as CreateExpensePayload;
        if (payload.book_id.startsWith("temp_")) return false;

        const { data, error } = await supabase
          .from("expenses")
          .insert({
            book_id: payload.book_id,
            title: payload.title,
            amount: payload.amount,
            date: payload.date,
            category_id: payload.category_id || null,
            expense_type: payload.expense_type ?? "debit",
            payment_method: payload.payment_method ?? "cash",
            notes: payload.notes ?? null,
            tags: payload.tags ?? [],
            paid_by: payload.paid_by ?? userId,
            created_by: payload.created_by ?? userId,
          })
          .select("*, categories(name, icon, color)")
          .single();
        if (error) throw error;

        const updatedExpense = {
          ...data,
          creator_profile: null,
          payer_profile: null,
          _offline: false,
        };
        const cached = await db.expenses.get(payload.book_id);
        if (cached) {
          const updatedExpenses = cached.expenses.map((expense) =>
            (expense as Record<string, unknown>).id === action.tempId
              ? updatedExpense
              : expense,
          );
          await db.expenses.put({
            ...cached,
            expenses: updatedExpenses,
            cachedAt: Date.now(),
          });
        }
        setStoredExpenses(
          payload.book_id,
          getStoredExpenses<Record<string, unknown>>(payload.book_id).map(
            (expense) =>
              expense.id === action.tempId ? updatedExpense : expense,
          ),
        );
        break;
      }
      case "update_expense": {
        const payload = action.payload as UpdateExpensePayload;
        if (payload.expenseId.startsWith("temp_")) return true;

        const update: TablesUpdate<"expenses"> = {};
        if (payload.title !== undefined) update.title = payload.title;
        if (payload.amount !== undefined) update.amount = payload.amount;
        if (payload.date !== undefined) update.date = payload.date;
        if (payload.category_id !== undefined) {
          update.category_id = payload.category_id || null;
        }
        if (payload.expense_type !== undefined) {
          update.expense_type = payload.expense_type;
        }
        if (payload.payment_method !== undefined) {
          update.payment_method = payload.payment_method;
        }
        if (payload.notes !== undefined) update.notes = payload.notes;
        if (payload.tags !== undefined) update.tags = payload.tags;

        const { error } = await supabase
          .from("expenses")
          .update(update)
          .eq("id", payload.expenseId);
        if (error) throw error;
        break;
      }
      case "delete_expense": {
        const payload = action.payload as DeleteExpensePayload;
        if (payload.expenseId.startsWith("temp_")) {
          await db.deletedExpenses.delete(payload.expenseId);
          return true;
        }

        const { error } = await supabase
          .from("expenses")
          .delete()
          .eq("id", payload.expenseId);
        if (error) throw error;

        await db.deletedExpenses.delete(payload.expenseId);
        break;
      }
      case "add_member": {
        const payload = action.payload as AddMemberPayload;
        const memberUserId = await resolveMemberUserId(payload);
        if (payload.bookId.startsWith("temp_")) return false;

        const { error } = await supabase.from("book_members").insert({
          book_id: payload.bookId,
          user_id: memberUserId,
          role: payload.role,
        });
        if (error) throw error;
        break;
      }
      case "remove_member": {
        const payload = action.payload as RemoveMemberPayload;
        if (payload.memberId.startsWith("temp_")) return true;

        const { error } = await supabase
          .from("book_members")
          .delete()
          .eq("id", payload.memberId);
        if (error) throw error;
        break;
      }
      case "update_member_role": {
        const payload = action.payload as UpdateMemberRolePayload;
        if (payload.memberId.startsWith("temp_")) return true;

        const { error } = await supabase
          .from("book_members")
          .update({ role: payload.role })
          .eq("id", payload.memberId);
        if (error) throw error;
        break;
      }
      default:
        return true;
    }

    return true;
  } catch (error) {
    console.error("[OfflineSync] action failed", action.type, error);
    return false;
  }
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const syncingRef = useRef(false);
  const saveCountRef = useRef(0);

  const beginWrite = useCallback(() => {
    saveCountRef.current += 1;
    setIsSaving(true);
  }, []);

  const endWrite = useCallback(() => {
    saveCountRef.current = Math.max(0, saveCountRef.current - 1);
    if (saveCountRef.current === 0) {
      setIsSaving(false);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await countPersistedQueue());
    } catch {
      setPendingCount(0);
    }
  }, []);

  const getQueuedActions = useCallback(async () => {
    return await getPersistedQueue();
  }, []);

  const upsertQueuedAction = useCallback(
    async (action: SyncAction) => {
      await upsertPersistedQueueAction(action);
      await refreshCount();
    },
    [refreshCount],
  );

  const removeQueuedActions = useCallback(
    async (actionIds: string[]) => {
      await removePersistedQueueActions(actionIds);
      await refreshCount();
    },
    [refreshCount],
  );

  const queueAction = useCallback(
    async (action: Omit<SyncAction, "id" | "createdAt" | "retryCount">) => {
      const queuedAction: SyncAction = {
        ...action,
        id: createSyncActionId(action.type),
        createdAt: Date.now(),
        retryCount: 0,
        userId: action.userId ?? user?.id,
      };

      const actionIdentity = getActionIdentity(queuedAction);
      if (actionIdentity) {
        const existingAction = (await getPersistedQueue()).find(
          (candidate) => getActionIdentity(candidate) === actionIdentity,
        );
        const mergedAction = existingAction
          ? mergeQueuedAction(existingAction, queuedAction)
          : null;

        if (mergedAction) {
          await upsertPersistedQueueAction(mergedAction);
          await refreshCount();
          return;
        }
      }

      await upsertPersistedQueueAction(queuedAction);
      await refreshCount();
    },
    [refreshCount, user?.id],
  );

  const cancelQueuedCreate = useCallback(
    async (tempId: string) => {
      const actions = await getPersistedQueue();
      const actionIds = actions
        .filter(
          (action) =>
            action.tempId === tempId ||
            (action.payload as Record<string, unknown>).tempId === tempId,
        )
        .map((action) => action.id);

      if (actionIds.length > 0) {
        await removePersistedQueueActions(actionIds);
        await refreshCount();
      }
    },
    [refreshCount],
  );

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !isOnline || !user) return;

    syncingRef.current = true;
    setSyncStatus("syncing");

    try {
      const initialActions = await getPersistedQueue();
      if (initialActions.length === 0) {
        setSyncStatus("idle");
        return;
      }

      let failed = 0;

      while (true) {
        const actions = await getPersistedQueue();
        const action = actions[0];
        if (!action) break;

        if (action.retryCount >= MAX_RETRY) {
          await removePersistedQueueActions([action.id]);
          continue;
        }

        const delay =
          action.retryCount > 0
            ? RETRY_BACKOFF_BASE * 2 ** (action.retryCount - 1)
            : 0;
        if (
          delay > 0 &&
          action.lastAttempt &&
          Date.now() - action.lastAttempt < delay
        ) {
          failed += 1;
          break;
        }

        const ok = await processAction(action, user.id);
        if (ok) {
          await removePersistedQueueActions([action.id]);
        } else {
          failed += 1;
          const nextAction = {
            ...action,
            retryCount: action.retryCount + 1,
            lastAttempt: Date.now(),
          };
          await upsertPersistedQueueAction(nextAction);
        }
      }

      await refreshCount();
      const remaining = await countPersistedQueue();

      if (remaining === 0) {
        setSyncStatus("success");
        setLastSyncedAt(Date.now());
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["books"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
          queryClient.invalidateQueries({ queryKey: ["categories"] }),
        ]);
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            (query.queryKey[0] === "expenses" ||
              query.queryKey[0] === "book-members" ||
              query.queryKey[0] === "book"),
        });
        window.setTimeout(() => setSyncStatus("idle"), 3000);
      } else if (failed > 0) {
        setSyncStatus("error");
      } else {
        setSyncStatus("idle");
      }
    } catch {
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [isOnline, queryClient, refreshCount, user]);

  useEffect(() => {
    if (isOnline && user) {
      void syncNow();
    }
  }, [isOnline, syncNow, user]);

  useEffect(() => {
    if (isOnline && user && pendingCount > 0 && syncStatus !== "syncing") {
      void syncNow();
    }
  }, [isOnline, pendingCount, syncNow, syncStatus, user]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const retrySync = () => {
      if (document.visibilityState === "hidden") return;
      void syncNow();
    };

    window.addEventListener("focus", retrySync);
    document.addEventListener("visibilitychange", retrySync);
    return () => {
      window.removeEventListener("focus", retrySync);
      document.removeEventListener("visibilitychange", retrySync);
    };
  }, [syncNow]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        syncStatus,
        pendingCount,
        lastSyncedAt,
        isSaving,
        beginWrite,
        endWrite,
        refreshPendingCount: refreshCount,
        queueAction,
        getQueuedActions,
        upsertQueuedAction,
        removeQueuedActions,
        cancelQueuedCreate,
        syncNow,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return context;
}
