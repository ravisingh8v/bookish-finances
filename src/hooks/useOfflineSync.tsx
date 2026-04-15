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
import {
  enqueueAction,
  getAllActions,
  removeAction,
  OfflineAction,
} from "@/lib/offlineStore";
import { useOnlineStatus } from "./useOnlineStatus";
import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface OfflineSyncContextType {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  queueAction: (action: Omit<OfflineAction, "id" | "createdAt">) => Promise<void>;
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const actions = await getAllActions();
      setPendingCount(actions.length);
    } catch {
      // IndexedDB might not be available
    }
  }, []);

  const queueAction = useCallback(
    async (action: Omit<OfflineAction, "id" | "createdAt">) => {
      const offlineAction: OfflineAction = {
        ...action,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        userId: action.userId ?? user?.id,
      };
      await enqueueAction(offlineAction);
      await refreshCount();
      toast.success("Saved locally. Will sync when internet is available.", {
        description: "Your data is safely stored and will be synced automatically.",
      });
    },
    [user, refreshCount]
  );

  const processAction = useCallback(
    async (action: OfflineAction): Promise<boolean> => {
      const currentUserId = user?.id;
      if (!currentUserId) return false;

      try {
        switch (action.type) {
          case "create_book": {
            const p = action.payload as {
              name: string;
              description?: string;
              currency?: string;
              color?: string;
            };
            const { data, error } = await supabase
              .from("expense_books")
              .insert({ ...p, created_by: currentUserId })
              .select()
              .single();
            if (error) throw error;
            await supabase
              .from("book_members")
              .insert({ book_id: data.id, user_id: currentUserId, role: "owner" });
            break;
          }
          case "create_expense": {
            const p = action.payload as {
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
            const { error } = await supabase.from("expenses").insert({
              ...p,
              paid_by: currentUserId,
              created_by: currentUserId,
            });
            if (error) throw error;
            break;
          }
          case "delete_expense": {
            const { expenseId } = action.payload as { expenseId: string };
            await supabase.from("expenses").delete().eq("id", expenseId);
            break;
          }
          case "delete_book": {
            const { bookId } = action.payload as { bookId: string };
            await supabase.from("expense_books").delete().eq("id", bookId);
            break;
          }
        }
        return true;
      } catch (err) {
        console.error("Failed to sync action:", action.type, err);
        return false;
      }
    },
    [user]
  );

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !isOnline || !user) return;
    syncingRef.current = true;
    setSyncStatus("syncing");

    try {
      const actions = await getAllActions();
      if (actions.length === 0) {
        setSyncStatus("idle");
        syncingRef.current = false;
        return;
      }

      let failed = 0;
      for (const action of actions) {
        const ok = await processAction(action);
        if (ok) {
          await removeAction(action.id);
        } else {
          failed++;
        }
      }

      await refreshCount();
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();

      if (failed > 0) {
        setSyncStatus("error");
        toast.error(`${failed} action(s) failed to sync. Will retry.`);
      } else {
        setSyncStatus("success");
        toast.success("All offline data synced!");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    } catch {
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [isOnline, user, processAction, refreshCount, queryClient]);

  // Auto-sync when coming online or logging in
  useEffect(() => {
    if (isOnline && user) {
      syncNow();
    }
  }, [isOnline, user, syncNow]);

  // Refresh count on mount
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  return (
    <OfflineSyncContext.Provider
      value={{ isOnline, syncStatus, pendingCount, queueAction, syncNow }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  return ctx;
}
