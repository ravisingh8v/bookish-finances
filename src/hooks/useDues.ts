import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export type DueFrequency = "one-time" | "installment" | "emi";
export type DueRole = "editor" | "viewer";

export interface DuePerson {
  id: string;
  email: string;
  role: DueRole;
}

export interface DuePayment {
  id: string;
  amount: number;
  notes?: string;
  date: string;
}

export interface EmiDetails {
  productPrice: number;
  processingFeePercent: number;
  gstPercent: number;
  processingFeeAmount: number;
  gstOnProcessing: number;
  interestRate: number;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  gstOnInterest: number;
  totalPayable: number;
}

export interface InstallmentPlan {
  installments: number;
  everyMonths: number;
}

export interface DueEntry {
  id: string;
  title: string;
  totalAmount: number;
  dueDate: string;
  frequency: DueFrequency;
  notes?: string;
  createdAt: string;
  payments: DuePayment[];
  people: DuePerson[];
  emiDetails?: EmiDetails;
  installmentPlan?: InstallmentPlan;
}

function normalizeFrequency(value: unknown): DueFrequency {
  return value === "one-time" || value === "installment" || value === "emi"
    ? value
    : "one-time";
}

/** Adds whole months to a `yyyy-mm-dd` date string, clamping to month end. */
export function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const base = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, lastDay));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

export interface ScheduleEntry {
  number: number;
  date: string;
  amount: number;
}

/**
 * Turns a due into an explicit payment schedule so the selected date always
 * has a visible, meaningful consequence.
 */
export function buildDueSchedule(due: DueEntry): ScheduleEntry[] {
  if (!due.dueDate) return [];
  if (due.frequency === "emi" && due.emiDetails) {
    const months = Math.max(1, due.emiDetails.tenureMonths);
    return Array.from({ length: months }, (_, i) => ({
      number: i + 1,
      date: addMonths(due.dueDate, i),
      amount: due.emiDetails!.monthlyEmi,
    }));
  }
  if (due.frequency === "installment") {
    const count = Math.max(1, due.installmentPlan?.installments ?? 1);
    const every = Math.max(1, due.installmentPlan?.everyMonths ?? 1);
    const per = due.totalAmount / count;
    return Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      date: addMonths(due.dueDate, i * every),
      amount: per,
    }));
  }
  return [{ number: 1, date: due.dueDate, amount: due.totalAmount }];
}

/** The next unpaid schedule entry, based on how much has been paid so far. */
export function getNextScheduleEntry(due: DueEntry): ScheduleEntry | null {
  const paid = getTotalPaid(due);
  let cumulative = 0;
  for (const entry of buildDueSchedule(due)) {
    cumulative += entry.amount;
    if (paid < cumulative - 0.01) return entry;
  }
  return null;
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatDueDate(dateStr: string): string {
  if (!dateStr) return "No date set";
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function dueDateLabel(frequency: DueFrequency): {
  label: string;
  help: string;
} {
  if (frequency === "emi")
    return {
      label: "First EMI date",
      help: "Every EMI after this repeats monthly on the same day. This drives your EMI schedule.",
    };
  if (frequency === "installment")
    return {
      label: "First installment date",
      help: "The remaining installments are scheduled from this date at the interval you choose.",
    };
  return {
    label: "Payment due date",
    help: "The full amount is expected on or before this date.",
  };
}


export function calculateEmiDetails(
  productPrice: number,
  processingFeePercent: number,
  interestRate: number,
  tenureMonths: number,
  gstPercent = 18,
): EmiDetails {
  const processingFeeAmount = productPrice * (processingFeePercent / 100);
  const gstOnProcessing = processingFeeAmount * (gstPercent / 100);
  const principal = productPrice;
  const monthlyRate = interestRate / 12 / 100;
  const months = Math.max(1, Math.round(tenureMonths));
  const monthlyEmi = monthlyRate > 0
    ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months))
    : principal / months;
  const totalInterest = monthlyEmi * months - principal;
  const gstOnInterest = totalInterest * (gstPercent / 100);
  const totalPayable =
    principal +
    processingFeeAmount +
    gstOnProcessing +
    totalInterest +
    gstOnInterest;

  return {
    productPrice: principal,
    processingFeePercent,
    gstPercent,
    processingFeeAmount,
    gstOnProcessing,
    interestRate,
    tenureMonths: months,
    monthlyEmi,
    totalInterest,
    gstOnInterest,
    totalPayable,
  };
}

export function getTotalPaid(due: DueEntry) {
  return due.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function useDues() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const duesQuery = useQuery({
    queryKey: ["dues"],
    queryFn: async (): Promise<DueEntry[]> => {
      if (!user) return [];
      const [
        { data: dueRows, error: dueError },
        { data: paymentRows, error: paymentError },
        { data: peopleRows, error: peopleError },
      ] = await Promise.all([
        supabase.from("dues").select("*").eq("user_id", user.id),
        supabase.from("due_payments").select("*").eq("user_id", user.id),
        supabase.from("due_people").select("*").eq("user_id", user.id),
      ]);
      if (dueError) throw dueError;
      if (paymentError) throw paymentError;
      if (peopleError) throw peopleError;

      const paymentsByDue = new Map<string, DuePayment[]>();
      for (const row of paymentRows ?? []) {
        const list = paymentsByDue.get(row.due_id) ?? [];
        list.push({
          id: row.id,
          amount: Number(row.amount) || 0,
          notes: row.notes ?? undefined,
          date: row.created_at,
        });
        paymentsByDue.set(row.due_id, list);
      }

      const peopleByDue = new Map<string, DuePerson[]>();
      for (const row of peopleRows ?? []) {
        const list = peopleByDue.get(row.due_id) ?? [];
        list.push({
          id: row.id,
          email: row.email,
          role: row.role === "editor" ? "editor" : "viewer",
        });
        peopleByDue.set(row.due_id, list);
      }

      return (dueRows ?? [])
        .map((row): DueEntry => ({
          id: row.id,
          title: row.title,
          totalAmount: Number(row.total_amount) || 0,
          dueDate: row.due_date ?? "",
          frequency: normalizeFrequency(row.frequency),
          notes: row.notes ?? undefined,
          createdAt: row.created_at,
          payments: (paymentsByDue.get(row.id) ?? []).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          ),
          people: peopleByDue.get(row.id) ?? [],
          emiDetails:
            row.emi_details && !("installments" in (row.emi_details as object))
              ? (row.emi_details as unknown as EmiDetails)
              : undefined,
          installmentPlan:
            row.emi_details && "installments" in (row.emi_details as object)
              ? (row.emi_details as unknown as InstallmentPlan)
              : undefined,

        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    },
    enabled: !!user,
  });

  const dues = useMemo(() => duesQuery.data ?? [], [duesQuery.data]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dues-realtime-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dues" },
        () => queryClient.invalidateQueries({ queryKey: ["dues"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "due_payments" },
        () => queryClient.invalidateQueries({ queryKey: ["dues"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "due_people" },
        () => queryClient.invalidateQueries({ queryKey: ["dues"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["dues"] });

  const addDueMutation = useMutation({
    mutationFn: async (
      payload: Omit<DueEntry, "id" | "createdAt" | "payments" | "people">,
    ) => {
      if (!user) throw new Error("Please log in again.");
      const { error } = await supabase.from("dues").insert({
        user_id: user.id,
        title: payload.title,
        total_amount: payload.totalAmount,
        due_date: payload.dueDate || null,
        frequency: payload.frequency,
        notes: payload.notes ?? null,
        emi_details: ((payload.emiDetails ?? payload.installmentPlan) ??
          null) as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Due added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDueMutation = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Omit<DueEntry, "createdAt" | "payments" | "people">) => {
      const { error } = await supabase
        .from("dues")
        .update({
          title: payload.title,
          total_amount: payload.totalAmount,
          due_date: payload.dueDate || null,
          frequency: payload.frequency,
          notes: payload.notes ?? null,
          emi_details: ((payload.emiDetails ?? payload.installmentPlan) ??
            null) as unknown as Json,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Due updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const deleteDueMutation = useMutation({
    mutationFn: async (dueId: string) => {
      const { error } = await supabase.from("dues").delete().eq("id", dueId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Due removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPaymentMutation = useMutation({
    mutationFn: async ({
      dueId,
      amount,
      notes,
    }: {
      dueId: string;
      amount: number;
      notes?: string;
    }) => {
      if (!user) throw new Error("Please log in again.");
      const { error } = await supabase.from("due_payments").insert({
        due_id: dueId,
        user_id: user.id,
        amount,
        notes: notes?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Payment recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from("due_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Payment removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPersonMutation = useMutation({
    mutationFn: async ({
      dueId,
      email,
      role,
    }: {
      dueId: string;
      email: string;
      role: DueRole;
    }) => {
      if (!user) throw new Error("Please log in again.");
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error("Email is required");
      const existing = dues.find((d) => d.id === dueId);
      if (existing?.people.some((p) => p.email === normalizedEmail)) {
        throw new Error("Person already invited");
      }
      const { error } = await supabase.from("due_people").insert({
        due_id: dueId,
        user_id: user.id,
        email: normalizedEmail,
        role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Person invited");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePersonMutation = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase
        .from("due_people")
        .delete()
        .eq("id", personId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Person removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePersonRoleMutation = useMutation({
    mutationFn: async ({
      personId,
      role,
    }: {
      personId: string;
      role: DueRole;
    }) => {
      const { error } = await supabase
        .from("due_people")
        .update({ role })
        .eq("id", personId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Person role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const total = dues.reduce((sum, due) => sum + due.totalAmount, 0);
    const paid = dues.reduce((sum, due) => sum + getTotalPaid(due), 0);
    const outstanding = total - paid;
    const count = dues.length;
    const pendingCount = dues.filter(
      (due) => due.totalAmount > getTotalPaid(due),
    ).length;
    return { total, paid, outstanding, count, pendingCount };
  }, [dues]);

  const addDue = useCallback(
    (payload: Omit<DueEntry, "id" | "createdAt" | "payments" | "people">) => {
      addDueMutation.mutate(payload);
    },
    [addDueMutation],
  );

  const deleteDue = useCallback(
    (dueId: string) => deleteDueMutation.mutate(dueId),
    [deleteDueMutation],
  );

  const addPayment = useCallback(
    (dueId: string, amount: number, notes?: string) =>
      addPaymentMutation.mutate({ dueId, amount, notes }),
    [addPaymentMutation],
  );

  const deletePayment = useCallback(
    (_dueId: string, paymentId: string) =>
      deletePaymentMutation.mutate(paymentId),
    [deletePaymentMutation],
  );

  const addPerson = useCallback(
    (dueId: string, email: string, role: DueRole) =>
      addPersonMutation.mutate({ dueId, email, role }),
    [addPersonMutation],
  );

  const removePerson = useCallback(
    (_dueId: string, personId: string) => removePersonMutation.mutate(personId),
    [removePersonMutation],
  );

  const updatePersonRole = useCallback(
    (_dueId: string, personId: string, role: DueRole) =>
      updatePersonRoleMutation.mutate({ personId, role }),
    [updatePersonRoleMutation],
  );

  const getDueById = useCallback(
    (dueId: string) => dues.find((due) => due.id === dueId) ?? null,
    [dues],
  );

  const clearDues = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from("dues")
      .delete()
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
    toast("All dues cleared");
  }, [user]);

  return {
    dues,
    totals,
    isLoading: duesQuery.isLoading,
    addDue,
    deleteDue,
    addPayment,
    deletePayment,
    addPerson,
    removePerson,
    updatePersonRole,
    clearDues,
    getDueById,
  };
}
