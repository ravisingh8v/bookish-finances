import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useOfflineSync } from "./useOfflineSync";

// The generated Supabase types may not yet include the split tables in all
// environments, so we use a loosely-typed client for these queries.
const db = supabase as any;

export interface SplitPayment {
  id: string;
  split_bill_id: string;
  split_participant_id: string;
  user_id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface SplitParticipant {
  id: string;
  split_bill_id: string;
  email: string;
  name: string | null;
  user_id: string | null;
  share_amount: number;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
  payments: SplitPayment[];
  amount_paid: number;
  remaining_amount: number;
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

function isMissingTableError(error: any, tableName: string) {
  return (
    error &&
    typeof error.message === "string" &&
    error.message.includes(tableName)
  );
}

export interface NewSplitInput {
  title: string;
  total_amount: number;
  currency: string;
  emails: string[];
  names?: Record<string, string>;
  notes?: string;
}

export function useSplitBills() {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);

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

      let paymentsByParticipant = new Map<string, SplitPayment[]>();
      if (billIds.length > 0) {
        const { data: payments, error: payErr } = await db
          .from("split_payments")
          .select("*")
          .in("split_bill_id", billIds);
        if (payErr) {
          if (isMissingTableError(payErr, "split_payments")) {
            setPaymentsEnabled(false);
          } else {
            throw payErr;
          }
        } else {
          setPaymentsEnabled(true);
          for (const rawPayment of payments ?? []) {
            const payment = {
              ...rawPayment,
              amount: Number(rawPayment.amount),
            } as SplitPayment;
            const list = paymentsByParticipant.get(payment.split_participant_id) ?? [];
            list.push(payment);
            paymentsByParticipant.set(payment.split_participant_id, list);
          }
        }
      }

      return (bills ?? []).map((b: any) => ({
        ...b,
        participants: (participantsByBill.get(b.id) ?? [])
          .map((p) => {
            const payments = (paymentsByParticipant.get(p.id) ?? []).sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            );
            const amount_paid = payments.reduce(
              (sum, payment) => sum + payment.amount,
              0,
            );
            const shareAmount = Number(p.share_amount);
            const remaining_amount = Math.max(0, shareAmount - amount_paid);
            return {
              ...p,
              payments,
              amount_paid,
              remaining_amount,
              is_settled: p.is_settled || amount_paid >= shareAmount,
            };
          })
          .sort((a, c) => a.email.localeCompare(c.email)),
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "split_payments" },
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
        name: input.names?.[email]?.trim() || null,
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

  const editSplit = useMutation({
    mutationFn: async (input: {
      id: string;
      title: string;
      total_amount: number;
      currency: string;
      notes?: string;
      emails: string[];
      names?: Record<string, string>;
    }) => {
      assertOnline(isOnline);
      if (!userId) throw new Error("Please sign in again.");

      const cleanEmails = Array.from(
        new Set(
          input.emails
            .map((e) => e.toLowerCase().trim())
            .filter((e) => e.length > 0),
        ),
      );
      if (cleanEmails.length === 0)
        throw new Error("Add at least one person to split with.");

      const headCount = cleanEmails.length + 1; // creator + invitees
      const share =
        headCount > 0
          ? Math.round((input.total_amount / headCount) * 100) / 100
          : 0;

      // Update bill details.
      const { error: billErr } = await db
        .from("split_bills")
        .update({
          title: input.title,
          total_amount: input.total_amount,
          currency: input.currency,
          notes: input.notes ?? null,
        })
        .eq("id", input.id);
      if (billErr) throw billErr;

      // Reconcile participants.
      const { data: existing, error: exErr } = await db
        .from("split_participants")
        .select("id, email")
        .eq("split_bill_id", input.id);
      if (exErr) throw exErr;

      const existingByEmail = new Map<string, string>(
        (existing ?? []).map((p: any) => [p.email?.toLowerCase().trim(), p.id]),
      );
      const existingEmails = new Set(existingByEmail.keys());
      const nextEmails = new Set(cleanEmails);

      // Remove participants no longer included.
      const toRemove = (existing ?? []).filter(
        (p: any) => !nextEmails.has(p.email?.toLowerCase().trim()),
      );
      if (toRemove.length > 0) {
        const { error: delErr } = await db
          .from("split_participants")
          .delete()
          .in(
            "id",
            toRemove.map((p: any) => p.id),
          );
        if (delErr) throw delErr;
      }

      // Resolve emails to existing users for new additions.
      const newEmails = cleanEmails.filter((e) => !existingEmails.has(e));
      let userMap = new Map<string, string>();
      if (newEmails.length > 0) {
        const { data: profiles } = await db
          .from("profiles")
          .select("user_id, email")
          .in("email", newEmails);
        userMap = new Map(
          (profiles ?? []).map((p: any) => [p.email?.toLowerCase(), p.user_id]),
        );
      }

      // Insert new participants.
      const rows = newEmails.map((email) => ({
        split_bill_id: input.id,
        email,
        name: input.names?.[email]?.trim() || null,
        user_id: userMap.get(email) ?? null,
        share_amount: share,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await db
          .from("split_participants")
          .insert(rows);
        if (insErr) throw insErr;
      }

      // Recompute share for all remaining participants.
      const keepIds = cleanEmails
        .filter((e) => existingEmails.has(e))
        .map((e) => existingByEmail.get(e)!);
      if (keepIds.length > 0) {
        const { error: updErr } = await db
          .from("split_participants")
          .update({ share_amount: share })
          .in("id", keepIds);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Split bill updated");
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

  const deletePayment = useMutation({
    mutationFn: async ({
      paymentId,
      participantId,
    }: {
      paymentId: string;
      participantId: string;
    }) => {
      assertOnline(isOnline);
      const { error } = await db
        .from("split_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;
      // Re-open settlement since the remaining amount changed.
      await db
        .from("split_participants")
        .update({ is_settled: false })
        .eq("id", participantId);
    },
    onSuccess: () => {
      invalidate();
      toast("Payment removed");
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

  const createPayment = useMutation({
    mutationFn: async ({
      participantId,
      amount,
      note,
    }: {
      participantId: string;
      amount: number;
      note?: string;
    }) => {
      assertOnline(isOnline);
      if (!userId) throw new Error("Please sign in again.");
      if (!paymentsEnabled)
        throw new Error(
          "Split payments are unavailable because the database migration has not been applied.",
        );

      const { data: participant, error: participantError } = await db
        .from("split_participants")
        .select("id, split_bill_id, user_id, email, share_amount")
        .eq("id", participantId)
        .single();
      if (participantError) throw participantError;
      if (!participant) throw new Error("Participant not found.");

      // Determine if the bill belongs to the current user (owner can log on behalf).
      const { data: bill } = await db
        .from("split_bills")
        .select("created_by")
        .eq("id", participant.split_bill_id)
        .single();
      const isOwner = bill?.created_by === userId;

      const userEmail = user?.email?.toLowerCase().trim();
      const emailMatches =
        !!userEmail && participant.email?.toLowerCase().trim() === userEmail;
      const isSelf = participant.user_id === userId;

      if (!isSelf && !emailMatches && !isOwner) {
        throw new Error("You can only add payments for your own share.");
      }

      // Auto-claim the participant record when the email matches but no user is linked yet.
      if (!participant.user_id && emailMatches) {
        await db
          .from("split_participants")
          .update({ user_id: userId })
          .eq("id", participantId);
      }

      const { data: existingPayments, error: paymentsError } = await db
        .from("split_payments")
        .select("amount")
        .eq("split_participant_id", participantId);
      if (paymentsError) {
        if (isMissingTableError(paymentsError, "split_payments")) {
          setPaymentsEnabled(false);
          throw new Error(
            "Split payments are unavailable because the database migration has not been applied.",
          );
        }
        throw paymentsError;
      }

      const paidSoFar = (existingPayments ?? []).reduce(
        (sum: number, entry: any) => sum + Number(entry.amount),
        0,
      );
      const remaining = Number(participant.share_amount) - paidSoFar;
      if (amount <= 0) throw new Error("Enter a payment amount greater than zero.");
      if (amount > remaining + 0.001)
        throw new Error(
          `Payment cannot exceed remaining amount of ${remaining}.`,
        );

      const { data: payment, error: paymentError } = await db
        .from("split_payments")
        .insert({
          split_bill_id: participant.split_bill_id,
          split_participant_id: participantId,
          user_id: userId,
          amount,
          note: note?.trim() || null,
        })
        .select("*")
        .single();
      if (paymentError) {
        if (isMissingTableError(paymentError, "split_payments")) {
          setPaymentsEnabled(false);
          throw new Error(
            "Split payments are unavailable because the database migration has not been applied.",
          );
        }
        throw paymentError;
      }

      if (paidSoFar + amount >= Number(participant.share_amount) - 0.001) {
        const { error: settleError } = await db
          .from("split_participants")
          .update({ is_settled: true })
          .eq("id", participantId);
        if (settleError) throw settleError;
      }

      return {
        ...payment,
        amount: Number(payment.amount),
      } as SplitPayment;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });


  return {
    splits: (splitsQuery.data ?? []) as SplitBill[],
    isLoading: splitsQuery.isLoading,
    createSplit,
    editSplit,
    deleteSplit,
    deletePayment,
    toggleSettled,
    createPayment,
    paymentsEnabled,
  };
}

