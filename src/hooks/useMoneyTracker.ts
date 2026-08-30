import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

export type MoneyTrackerType = "investment" | "recurring_expense" | "emi";
export type AutomationPreference = "track_only" | "reminder" | "auto_entry";

export interface MoneyTrackerItem {
  id: string;
  user_id: string;
  item_type: MoneyTrackerType;
  name: string;
  amount: number;
  frequency: string;
  schedule_day: number | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  automation_preference: AutomationPreference;
  target_book_id: string | null;
  category_id: string | null;
  account: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  last_processed_date: string | null;
  created_at: string;
  updated_at: string;
}

export type MoneyTrackerInput = Omit<
  MoneyTrackerItem,
  "id" | "user_id" | "created_at" | "updated_at" | "last_processed_date"
> & {
  last_processed_date?: string | null;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: unknown) {
  return Number(value) || 0;
}

function occurrenceForToday(item: MoneyTrackerItem) {
  const now = new Date();
  const scheduleDay = item.schedule_day ?? now.getDate();
  // clamp to this month's last day (handles Feb and months with 30 days)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(scheduleDay, lastDay);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function assertOnline(isOnline: boolean) {
  if (!isOnline) {
    throw new Error("You're offline. Connect to the internet to continue.");
  }
}

export function useMoneyTracker() {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();
  const processingRef = useRef(new Set<string>());

  const itemsQuery = useQuery({
    queryKey: ["money-tracker", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("money_tracker_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MoneyTrackerItem[];
    },
    enabled: !!user && isOnline,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["money-tracker"] });
    queryClient.invalidateQueries({ queryKey: ["book-totals"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const createItem = useMutation({
    mutationFn: async (payload: MoneyTrackerInput) => {
      assertOnline(isOnline);
      if (!user) throw new Error("User ID not available. Please log in again.");
      const { data, error } = await supabase
        .from("money_tracker_items")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data as MoneyTrackerItem;
    },
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: async ({
      itemId,
      ...payload
    }: Partial<MoneyTrackerInput> & { itemId: string }) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("money_tracker_items")
        .update(payload)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      assertOnline(isOnline);
      const { error } = await supabase
        .from("money_tracker_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const generateBookEntry = useMutation({
    mutationFn: async (item: MoneyTrackerItem) => {
      assertOnline(isOnline);
      if (!user) throw new Error("User ID not available. Please log in again.");
      if (!item.target_book_id) throw new Error("Select a target book first.");
      if (item.automation_preference !== "auto_entry") {
        throw new Error("Automatic book entry is not enabled.");
      }

      const occurrenceDate = occurrenceForToday(item);
      const title =
        item.item_type === "investment"
          ? `Investment: ${item.name}`
          : item.item_type === "emi"
            ? `EMI: ${item.name}`
            : item.name;
      try {
        const { data, error } = await supabase
          .from("expenses")
          .insert({
            book_id: item.target_book_id,
            title,
            amount: item.amount,
            date: new Date(`${occurrenceDate}T09:00:00`).toISOString(),
            category_id: item.category_id,
            expense_type: "debit",
            payment_method: "bank_transfer",
            notes: item.notes,
            tags: ["money-tracker", item.item_type],
            paid_by: user.id,
            created_by: user.id,
            source_type: item.item_type,
            source_id: item.id,
            source_occurrence_date: occurrenceDate,
          } as never)
          .select("*")
          .single();
        if (error) throw error;

        await supabase
          .from("money_tracker_items")
          .update({ last_processed_date: todayKey() })
          .eq("id", item.id);
        return data;
      } catch (e: any) {
        // If the insert failed because an entry for this source + occurrence
        // already exists (unique constraint), handle it gracefully and
        // surface an informational message instead of an error toast.
        const msg = e?.message ?? String(e);
        const isDuplicate =
          /duplicate key value violates unique constraint/i.test(msg) ||
          /already exists/i.test(msg) ||
          (e?.code === "23505");
        if (isDuplicate) {
          // mark as processed to avoid retry loops and return null
          try {
            await supabase
              .from("money_tracker_items")
              .update({ last_processed_date: todayKey() })
              .eq("id", item.id);
          } catch {
            // ignore
          }
          // throw a special sentinel so callers can show an info toast,
          // but the mutation's onError will still receive something.
          const info = new Error("An entry for this occurrence already exists.");
          // attach a flag so UI can detect it
          (info as any).isDuplicateSource = true;
          throw info;
        }
        throw e;
      }
    },
    onSuccess: invalidate,
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  useEffect(() => {
    if (!user || !isOnline) return;
    const today = new Date();
    const todayDate = todayKey();
    for (const item of items) {
      const key = `${item.id}:${todayDate}`;
      if (
        !item.active ||
        item.automation_preference !== "auto_entry" ||
        !item.target_book_id ||
        numberValue(item.amount) <= 0 ||
        !item.schedule_day ||
        item.last_processed_date === todayDate ||
        processingRef.current.has(key)
      ) {
        continue;
      }
      // Compute occurrence day for this month (clamped to month's last day)
      const lastDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const occurrenceDay = Math.min(item.schedule_day ?? today.getDate(), lastDayThisMonth);
      if (occurrenceDay !== today.getDate()) {
        continue;
      }

      processingRef.current.add(key);
      generateBookEntry.mutate(item, {
        onSettled: () => processingRef.current.delete(key),
      });
    }
  }, [generateBookEntry, isOnline, items, user]);

  return {
    items,
    investments: items.filter((item) => item.item_type === "investment"),
    recurringExpenses: items.filter((item) => item.item_type === "recurring_expense"),
    emis: items.filter((item) => item.item_type === "emi"),
    isLoading: itemsQuery.isLoading,
    createItem,
    updateItem,
    deleteItem,
    generateBookEntry,
  };
}
