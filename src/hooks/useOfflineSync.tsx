import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { db, SyncAction } from "@/lib/db";
import { useOnlineStatus } from "./useOnlineStatus";
import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface OfflineSyncContextType {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  queueAction: (action: Omit<SyncAction, "id" | "createdAt" | "retryCount">) => Promise<void>;
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

const MAX_RETRY = 5;
const RETRY_BACKOFF_BASE = 2000;

async function processAction(action: SyncAction, userId: string): Promise<boolean> {
  try {
    switch (action.type) {
      case "create_book": {
        const p = action.payload as { name: string; description?: string; currency?: string; color?: string; icon?: string; tempId?: string };
        const { data, error } = await supabase.from("expense_books")
          .insert({ name: p.name, description: p.description, currency: p.currency, color: p.color, icon: p.icon, created_by: userId })
          .select().single();
        if (error) throw error;
        await supabase.from("book_members").insert({ book_id: data.id, user_id: userId, role: "owner" });
        if (action.tempId) {
          await db.books.delete(action.tempId);
          await db.books.put({ id: data.id, data: { ...data, members: [{ user_id: userId, role: "owner" }], my_access: [{ user_id: userId, role: "owner" }] }, cachedAt: Date.now() });
        }
        break;
      }
      case "update_book": {
        const p = action.payload as { bookId: string; name?: string; description?: string; currency?: string; color?: string; icon?: string };
        const { error } = await supabase.from("expense_books").update({ name: p.name, description: p.description, currency: p.currency, color: p.color, icon: p.icon }).eq("id", p.bookId);
        if (error) throw error;
        break;
      }
      case "delete_book": {
        const { bookId } = action.payload as { bookId: string };
        const { error } = await supabase.from("expense_books").delete().eq("id", bookId);
        if (error) throw error;
        await db.books.delete(bookId);
        await db.expenses.delete(bookId);
        break;
      }
      case "create_expense": {
        const p = action.payload as { book_id: string; title: string; amount: number; date?: string; category_id?: string; expense_type?: string; payment_method?: string; notes?: string; tags?: string[]; tempId?: string };
        const { data, error } = await supabase.from("expenses").insert({
          book_id: p.book_id, title: p.title, amount: p.amount, date: p.date,
          category_id: p.category_id || null, expense_type: p.expense_type ?? "debit",
          payment_method: p.payment_method ?? "cash", notes: p.notes ?? null,
          tags: p.tags ?? [], paid_by: userId, created_by: userId,
        }).select("*, categories(name, icon, color)").single();
        if (error) throw error;
        if (action.tempId) {
          const cached = await db.expenses.get(p.book_id);
          if (cached) {
            const updated = cached.expenses.map((e) =>
              (e as Record<string, unknown>).id === action.tempId
                ? { ...data, creator_profile: null, payer_profile: null }
                : e
            );
            await db.expenses.put({ id: p.book_id, expenses: updated, cachedAt: Date.now() });
          }
        }
        break;
      }
      case "update_expense": {
        const p = action.payload as { expenseId: string; bookId: string; title?: string; amount?: number; date?: string; category_id?: string; expense_type?: string; payment_method?: string; notes?: string; tags?: string[] };
        const update: Record<string, unknown> = {};
        if (p.title !== undefined) update.title = p.title;
        if (p.amount !== undefined) update.amount = p.amount;
        if (p.date !== undefined) update.date = p.date;
        if (p.category_id !== undefined) update.category_id = p.category_id || null;
        if (p.expense_type !== undefined) update.expense_type = p.expense_type;
        if (p.payment_method !== undefined) update.payment_method = p.payment_method;
        if (p.notes !== undefined) update.notes = p.notes;
        if (p.tags !== undefined) update.tags = p.tags;
        const { error } = await supabase.from("expenses").update(update).eq("id", p.expenseId);
        if (error) throw error;
        break;
      }
      case "delete_expense": {
        const { expenseId } = action.payload as { expenseId: string };
        const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
        if (error) throw error;
        await db.deletedExpenses.delete(expenseId);
        break;
      }
      case "add_member": {
        const p = action.payload as { bookId: string; userId: string; role: string };
        const { error } = await supabase.from("book_members").insert({ book_id: p.bookId, user_id: p.userId, role: p.role });
        if (error) throw error;
        break;
      }
      case "remove_member": {
        const p = action.payload as { memberId: string };
        const { error } = await supabase.from("book_members").delete().eq("id", p.memberId);
        if (error) throw error;
        break;
      }
      case "update_member_role": {
        const p = action.payload as { memberId: string; role: string };
        const { error } = await supabase.from("book_members").update({ role: p.role }).eq("id", p.memberId);
        if (error) throw error;
        break;
      }
      default:
        return true;
    }
    return true;
  } catch (err) {
    console.error("[OfflineSync] Failed action:", action.type, err);
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
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await db.syncQueue.count();
      setPendingCount(count);
    } catch { /* IndexedDB unavailable */ }
  }, []);

  const queueAction = useCallback(
    async (action: Omit<SyncAction, "id" | "createdAt" | "retryCount">) => {
      const full: SyncAction = {
        ...action,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        retryCount: 0,
        userId: action.userId ?? user?.id,
      };
      await db.syncQueue.put(full);
      await refreshCount();
    },
    [user, refreshCount]
  );

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !isOnline || !user) return;
    syncingRef.current = true;
    setSyncStatus("syncing");

    try {
      const actions = await db.syncQueue.orderBy("createdAt").toArray();
      if (actions.length === 0) {
        setSyncStatus("idle");
        syncingRef.current = false;
        return;
      }

      let failed = 0;
      for (const action of actions) {
        if (action.retryCount >= MAX_RETRY) {
          await db.syncQueue.delete(action.id);
          continue;
        }
        const delay = action.retryCount > 0 ? RETRY_BACKOFF_BASE * Math.pow(2, action.retryCount - 1) : 0;
        if (delay > 0 && action.lastAttempt && Date.now() - action.lastAttempt < delay) {
          failed++;
          continue;
        }
        const ok = await processAction(action, user.id);
        if (ok) {
          await db.syncQueue.delete(action.id);
        } else {
          await db.syncQueue.update(action.id, { retryCount: action.retryCount + 1, lastAttempt: Date.now() });
          failed++;
        }
      }

      await refreshCount();
      const remaining = await db.syncQueue.count();
      if (remaining === 0) {
        setSyncStatus("success");
        setLastSyncedAt(Date.now());
        queryClient.invalidateQueries();
        setTimeout(() => setSyncStatus("idle"), 3000);
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
  }, [isOnline, user, refreshCount, queryClient]);

  useEffect(() => {
    if (isOnline && user) syncNow();
  }, [isOnline, user, syncNow]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  return (
    <OfflineSyncContext.Provider value={{ isOnline, syncStatus, pendingCount, lastSyncedAt, queueAction, syncNow }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  return ctx;
}
