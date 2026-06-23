import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

// The generated Supabase types may not yet include the split tables in all
// environments, so we use a loosely-typed client for these queries.
const db = supabase as any;

export interface SplitParticipant {
  id: string;
  split_bill_id: string;
  email: string;
  user_id: string | null;
  share_amount: number;
  is_settled: boolean;
  created_at: string;
}

export interface SplitBill {
  id: string;
  created_by: string;
  title: string;
  total_amount: number;
  currency: string;
  split_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  participants: SplitParticipant[];
}

function assertOnline(isOnline: boolean) {
  if (!isOnline) {
    throw new Error("You're offline. Connect to the internet to continue.");
  }
}

export interface NewSplitInput {
  title: string;
  total_amount: number;
  currency: string;
  emails: string[];
  notes?: string;
}

export function useSplitBills() {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const splitsQuery = useQuery({
    queryKey: ["split-bills", userId],
    enabled: !!userId && isOnline,
    queryFn: async () => {
      const { data: bills, error } = await db
        .from("split_bills")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const billIds = (bills ?? []).map((b: any) => b.id);
      let participantsByBill = new Map<string, SplitParticipant[]>();
      if (billIds.length > 0) {
        const { data: parts, error: pErr } = await db
          .from("split_participants")
          .select("*")
          .in("split_bill_id", billIds);
        if (pErr) throw pErr;
        for (const p of parts ?? []) {
          const list = participantsByBill.get(p.split_bill_id) ?? [];
          list.push(p as SplitParticipant);
          participantsByBill.set(p.split_bill_id, list);
        }
      }

      return (bills ?? []).map((b: any) => ({
        ...b,
        participants: (participantsByBill.get(b.id) ?? []).sort(
          (a, c) => a.email.localeCompare(c.email),
        ),
      })) as SplitBill[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = db
      .channel(`split-bills-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "split_bills" },
        () => queryClient.invalidateQueries({ queryKey: ["split-bills", userId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "split_participants" },
        () => queryClient.invalidateQueries({ queryKey: ["split-bills", userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["split-bills", userId] });

  const createSplit = useMutation({
    mutationFn: async (input: NewSplitInput) => {
      assertOnline(isOnline);
      if (!userId) throw new Error("Please sign in again.");
      const cleanEmails = Array.from(
        new Set(
          input.emails
            .map((e) => e.toLowerCase().trim())
            .filter((e) => e.length > 0),
        ),
      );
      // Include the creator implicitly by sharing across all participants.
      const headCount = cleanEmails.length + 1; // creator + invitees
      const share =
        headCount > 0
          ? Math.round((input.total_amount / headCount) * 100) / 100
          : 0;

      const { data: bill, error } = await db
        .from("split_bills")
        .insert({
          created_by: userId,
          title: input.title,
          total_amount: input.total_amount,
          currency: input.currency,
          split_type: "equal",
          notes: input.notes ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Resolve emails to existing users for visibility.
      let userMap = new Map<string, string>();
      if (cleanEmails.length > 0) {
        const { data: profiles } = await db
          .from("profiles")
          .select("user_id, email")
          .in("email", cleanEmails);
        userMap = new Map(
          (profiles ?? []).map((p: any) => [p.email?.toLowerCase(), p.user_id]),
        );
      }

      const rows = cleanEmails.map((email) => ({
        split_bill_id: bill.id,
        email,
        user_id: userMap.get(email) ?? null,
        share_amount: share,
      }));

      if (rows.length > 0) {
        const { error: pErr } = await db
          .from("split_participants")
          .insert(rows);
        if (pErr) throw pErr;
      }
      return bill;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Split bill created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSplit = useMutation({
    mutationFn: async (splitId: string) => {
      assertOnline(isOnline);
      const { error } = await db.from("split_bills").delete().eq("id", splitId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Split bill deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSettled = useMutation({
    mutationFn: async ({
      participantId,
      isSettled,
    }: {
      participantId: string;
      isSettled: boolean;
    }) => {
      assertOnline(isOnline);
      const { error } = await db
        .from("split_participants")
        .update({ is_settled: isSettled })
        .eq("id", participantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    splits: (splitsQuery.data ?? []) as SplitBill[],
    isLoading: splitsQuery.isLoading,
    createSplit,
    deleteSplit,
    toggleSettled,
  };
}
