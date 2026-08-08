import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type DebtType = "one_time" | "emi" | "custom";
export type DebtStatus =
  | "pending"
  | "accepted"
  | "partially_paid"
  | "paid"
  | "rejected"
  | "cancelled"
  | "overdue";
export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Installment {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  paid_date?: string | null;
}

export interface Payment {
  id: string;
  installment_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
  added_by: string;
  created_at: string;
  book_id?: string | null;
}

export interface Activity {
  id: string;
  event_type: string;
  actor_id?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface LoanDetails {
  loan_name?: string;
  lender_type?: string;
  lender_name?: string;
  principal_amount: number;
  interest_rate: number;
  interest_type: "flat" | "reducing";
  processing_fee: number;
  processing_fee_percent?: number;
  documentation_charges?: number;
  gst?: number;
  insurance_charges?: number;
  late_fee?: number;
  prepayment_charges?: number;
  other_charges?: number;
  total_interest: number;
  total_repayable_amount: number;
  emi_amount: number;
  number_of_emis: number;
  payment_frequency: Frequency;
  due_day?: number;
  loan_start_date: string;
  first_emi_date: string;
  bank_name?: string;
  loan_account_number?: string;
  reference_number?: string;
  branch?: string;
  automatic_calculation: boolean;
}

export interface Profile {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface Debt {
  id: string;
  source?: string;
  lender_id?: string | null;
  borrower_id?: string | null;
  created_by?: string;
  direction?: "receivable" | "payable";
  view_direction?: "receivable" | "payable";
  counterparty_alias?: string | null;
  counterparty_email?: string | null;
  debt_type: DebtType;
  status: DebtStatus;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  description: string;
  notes?: string | null;
  due_date?: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
  lender?: Profile | null;
  borrower?: Profile | null;
  loan_details?: LoanDetails | null;
  installments: Installment[];
  payments: Payment[];
  activities: Activity[];
}

export interface DebtInput {
  direction: "receivable" | "payable";
  borrowerEmail?: string;
  personAlias?: string;
  title: string;
  debtType: DebtType;
  amount: number;
  description?: string;
  notes?: string;
  dueDate?: string;
  loan?: Partial<LoanDetails> & { processing_fee_percent?: number };
  installments?: { amount: number; due_date: string }[];
}

export interface DebtEditInput {
  id: string;
  title?: string;
  notes?: string;
  personAlias?: string;
  borrowerEmail?: string;
  dueDate?: string;
  amount?: number;
  direction?: "receivable" | "payable";
  debtType?: DebtType;
  installments?: { amount: number; due_date: string }[];
  loan?: Partial<LoanDetails> & { processing_fee_percent?: number };
}

const OPEN_STATUSES: DebtStatus[] = [
  "pending",
  "accepted",
  "partially_paid",
  "overdue",
];
export const isCompletedDebt = (debt: Debt) =>
  ["paid", "rejected", "cancelled"].includes(debt.status);

const toNumber = (value: unknown) => Number(value) || 0;
const isMissingDebtRpc = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" ||
  /Could not find the function public\.get_my_debts/i.test(
    error.message ?? "",
  );
const isMissingDebtBackend = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" ||
  error.code === "42P01" ||
  /Could not find the function public\./i.test(error.message ?? "") ||
  /relation .*public\.(debts|debt_)/i.test(error.message ?? "");
const debtTypeToDueFrequency = (debtType: DebtType) =>
  debtType === "emi" ? "emi" : debtType === "custom" ? "installment" : "one-time";
const debtInputDueDate = (input: DebtInput | DebtEditInput) =>
  input.dueDate?.trim() ||
  input.installments?.[0]?.due_date ||
  input.loan?.first_emi_date ||
  null;
const dueDateOverrideKey = "bookish-debt-due-date-overrides";
const readDueDateOverrides = () => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(
      window.localStorage.getItem(dueDateOverrideKey) || "{}",
    ) as Record<string, string>;
  } catch {
    return {};
  }
};
const writeDueDateOverride = (debtId: string, dueDate: string) => {
  if (typeof window === "undefined") return;
  const overrides = readDueDateOverrides();
  overrides[debtId] = dueDate;
  window.localStorage.setItem(dueDateOverrideKey, JSON.stringify(overrides));
};

const numberize = (debt: Debt): Debt => ({
  ...debt,
  total_amount: toNumber(debt.total_amount),
  paid_amount: toNumber(debt.paid_amount),
  remaining_amount: toNumber(debt.remaining_amount),
  installments: (debt.installments || []).map((installment) => ({
    ...installment,
    amount: toNumber(installment.amount),
    paid_amount: toNumber(installment.paid_amount),
    remaining_amount: toNumber(installment.remaining_amount),
  })),
  payments: (debt.payments || []).map((payment) => ({
    ...payment,
    amount: toNumber(payment.amount),
  })),
});
const applyDueDateOverrides = (debts: Debt[]) => {
  const overrides = readDueDateOverrides();
  return debts.map((debt) => {
    const dueDate = overrides[debt.id];
    if (!dueDate) return debt;
    return numberize({
      ...debt,
      due_date: dueDate,
      installments:
        debt.installments?.length && debt.debt_type !== "one_time"
          ? debt.installments.map((installment, index) =>
              index === 0 ? { ...installment, due_date: dueDate } : installment,
            )
          : debt.installments,
      loan_details: debt.loan_details
        ? { ...debt.loan_details, first_emi_date: dueDate }
        : debt.loan_details,
    });
  });
};

export function calculateLoan(
  principal: number,
  rate: number,
  count: number,
  type: "flat" | "reducing",
  frequency: Frequency,
) {
  const periods = Math.max(1, count);
  const yearlyPeriods = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[
    frequency
  ];
  const periodicRate = rate / 100 / yearlyPeriods;
  const emi =
    type === "reducing" && periodicRate > 0
      ? (principal * periodicRate * Math.pow(1 + periodicRate, periods)) /
        (Math.pow(1 + periodicRate, periods) - 1)
      : (principal + principal * (rate / 100) * (periods / yearlyPeriods)) /
        periods;

  return {
    emi: Math.round(emi * 100) / 100,
    interest: Math.round((emi * periods - principal) * 100) / 100,
    total: Math.round(emi * periods * 100) / 100,
  };
}

async function getLegacyDebts(userId: string): Promise<Debt[]> {
  const [
    { data: dueRows, error: dueError },
    { data: paymentRows, error: paymentError },
    { data: peopleRows, error: peopleError },
  ] = await Promise.all([
    supabase.from("dues").select("*").eq("user_id", userId),
    supabase.from("due_payments").select("*").eq("user_id", userId),
    supabase.from("due_people").select("*").eq("user_id", userId),
  ]);
  if (dueError) throw dueError;
  if (paymentError) throw paymentError;
  if (peopleError) throw peopleError;

  const paymentsByDue = new Map<string, Payment[]>();
  for (const row of paymentRows ?? []) {
    const list = paymentsByDue.get(row.due_id) ?? [];
    list.push({
      id: row.id,
      amount: toNumber(row.amount),
      payment_date: row.created_at,
      payment_method: "cash",
      reference_number: null,
      notes: row.notes,
      added_by: row.user_id,
      created_at: row.created_at,
      book_id: null,
    });
    paymentsByDue.set(row.due_id, list);
  }

  const peopleByDue = new Map<string, string>();
  for (const row of peopleRows ?? []) {
    if (!peopleByDue.has(row.due_id)) peopleByDue.set(row.due_id, row.email);
  }

  return (dueRows ?? []).map((row) => {
    const total = toNumber(row.total_amount);
    const payments = paymentsByDue.get(row.id) ?? [];
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const remaining = Math.max(0, total - paid);
    const status: DebtStatus = remaining <= 0 ? "paid" : "accepted";
    const debtType: DebtType =
      row.frequency === "emi"
        ? "emi"
        : row.frequency === "installment"
          ? "custom"
          : "one_time";

    return numberize({
      id: row.id,
      lender_id: null,
      borrower_id: userId,
      created_by: userId,
      direction: "payable",
      view_direction: "payable",
      counterparty_alias: null,
      counterparty_email: peopleByDue.get(row.id) ?? null,
      debt_type: debtType,
      status,
      total_amount: total,
      paid_amount: paid,
      remaining_amount: remaining,
      description: row.title,
      notes: row.notes,
      due_date: row.due_date,
      currency: "INR",
      source: "legacy_due",
      created_at: row.created_at,
      updated_at: row.updated_at,
      lender: null,
      borrower: null,
      loan_details: null,
      installments: [],
      payments,
      activities: [],
    });
  });
}

function buildLegacyEmiDetails(input: DebtInput | DebtEditInput) {
  if (input.debtType !== "emi" || !input.loan) return null;
  return {
    productPrice: input.loan.principal_amount ?? input.amount ?? 0,
    processingFeePercent: input.loan.processing_fee_percent ?? 0,
    gstPercent: 18,
    processingFeeAmount: input.loan.processing_fee ?? 0,
    gstOnProcessing: 0,
    interestRate: input.loan.interest_rate ?? 0,
    tenureMonths: input.loan.number_of_emis ?? 1,
    monthlyEmi: input.loan.emi_amount ?? 0,
    totalInterest: input.loan.total_interest ?? 0,
    gstOnInterest: 0,
    totalPayable: input.amount ?? input.loan.total_repayable_amount ?? 0,
  };
}

async function createLegacyDebt(input: DebtInput, userId: string) {
  const { data, error } = await supabase
    .from("dues")
    .insert({
      user_id: userId,
      title: input.title || input.description || "Debt",
      total_amount: input.amount,
      due_date: debtInputDueDate(input),
      frequency: debtTypeToDueFrequency(input.debtType),
      notes: input.notes?.trim() || null,
      emi_details: buildLegacyEmiDetails(input) as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;

  const email = input.borrowerEmail?.trim().toLowerCase();
  if (email && data?.id) {
    const { error: peopleError } = await supabase.from("due_people").insert({
      due_id: data.id,
      user_id: userId,
      email,
      role: "viewer",
    });
    if (peopleError) throw peopleError;
  }

  return data?.id;
}

async function updateLegacyDebt(input: DebtEditInput) {
  const { id, ...rest } = input;
  const updates: Record<string, Json | number | string | null> = {};
  if (rest.title !== undefined) updates.title = rest.title;
  if (rest.amount !== undefined) updates.total_amount = rest.amount;
  if (
    debtInputDueDate(input) !== null
  ) {
    updates.due_date = debtInputDueDate(input);
  }
  if (rest.debtType) updates.frequency = debtTypeToDueFrequency(rest.debtType);
  if (rest.notes !== undefined) updates.notes = rest.notes || null;
  if (rest.debtType === "emi") {
    updates.emi_details = buildLegacyEmiDetails(input) as unknown as Json;
  }
  const { error } = await supabase
    .from("dues")
    .update(updates as never)
    .eq("id", id);
  if (error) throw error;
}

async function updateDebtDueDateColumn(id: string, dueDate: string | null) {
  const { error } = await supabase
    .from("debts")
    .update({ due_date: dueDate })
    .eq("id", id);
  if (error && !isMissingDebtBackend(error)) {
    console.warn("Could not patch debt due_date directly", error);
  }
}

async function recordLegacyPayment({
  id,
  amount,
  notes,
  userId,
}: {
  id: string;
  amount: number;
  notes?: string;
  userId: string;
}) {
  const { error } = await supabase.from("due_payments").insert({
    due_id: id,
    user_id: userId,
    amount,
    notes: notes?.trim() || null,
  });
  if (error) throw error;
}

export function useDebts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["debts", user?.id];

  const debtsQuery = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_debts");
      if (error) {
        if (user?.id && isMissingDebtRpc(error)) {
          return applyDueDateOverrides(await getLegacyDebts(user.id));
        }
        throw error;
      }
      return applyDueDateOverrides(
        ((data || []) as unknown as Debt[]).map(numberize),
      );
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["debts"] });
  const debts = debtsQuery.data ?? [];
  const receivables = debts.filter(
    (debt) =>
      debt.view_direction === "receivable" ||
      (!debt.view_direction && debt.lender_id === user?.id),
  );
  const payables = debts.filter(
    (debt) =>
      debt.view_direction === "payable" ||
      (!debt.view_direction && debt.borrower_id === user?.id),
  );

  const createDebt = useMutation({
    mutationFn: async (input: DebtInput) => {
      const { data, error } = await supabase.rpc("create_debt", {
        _payload: input as unknown as Json,
      });
      if (error) {
        if (user?.id && isMissingDebtBackend(error)) {
          return createLegacyDebt(input, user.id);
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["book-totals"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Debt saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateDebt = useMutation({
    mutationFn: async (input: DebtEditInput) => {
      const { id, ...rest } = input;
      const { error } = await supabase.rpc("update_debt", {
        _debt_id: id,
        _payload: rest as unknown as Json,
      });
      if (error) {
        if (isMissingDebtBackend(error)) {
          await updateLegacyDebt(input);
          return;
        }
        throw error;
      }
      const dueDate = debtInputDueDate(input);
      if (dueDate) {
        writeDueDateOverride(id, dueDate);
        await updateDebtDueDateColumn(id, dueDate);
      }
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["debts"] });
      const previous = queryClient.getQueryData<Debt[]>(queryKey);
      queryClient.setQueryData<Debt[]>(queryKey, (old) =>
        (old ?? []).map((debt) => {
          if (debt.id !== input.id) return debt;
          const total = input.amount ?? debt.total_amount;
          const remaining = Math.max(0, total - debt.paid_amount);
          const dueDate = debtInputDueDate(input) ?? debt.due_date;
          const installments =
            input.installments?.map((installment, index) => ({
              id: debt.installments[index]?.id ?? `${debt.id}-${index + 1}`,
              installment_number: index + 1,
              due_date: installment.due_date,
              amount: installment.amount,
              paid_amount: debt.installments[index]?.paid_amount ?? 0,
              remaining_amount: installment.amount,
              status: debt.installments[index]?.status ?? "upcoming",
              paid_date: debt.installments[index]?.paid_date ?? null,
            })) ?? debt.installments;
          const loanDetails =
            input.loan && debt.loan_details
              ? { ...debt.loan_details, ...input.loan }
              : input.loan && input.debtType === "emi"
                ? (input.loan as LoanDetails)
                : debt.loan_details;
          return numberize({
            ...debt,
            direction: input.direction ?? debt.direction,
            view_direction: input.direction ?? debt.view_direction,
            description: input.title ?? debt.description,
            notes: input.notes ?? debt.notes,
            counterparty_alias:
              input.personAlias !== undefined
                ? input.personAlias || null
                : debt.counterparty_alias,
            counterparty_email:
              input.borrowerEmail !== undefined
                ? input.borrowerEmail || null
                : debt.counterparty_email,
            due_date: dueDate,
            debt_type: input.debtType ?? debt.debt_type,
            total_amount: total,
            remaining_amount: remaining,
            installments,
            loan_details: loanDetails,
            updated_at: new Date().toISOString(),
          });
        }),
      );
      return { previous };
    },
    onSuccess: () => {
      invalidate();
      toast.success("Debt updated");
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(error.message);
    },
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const { error } = await supabase.rpc("act_on_debt", {
        _debt_id: id,
        _action_name: action,
      });
      if (error) {
        if (isMissingDebtBackend(error)) return;
        throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Debt updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recordPayment = useMutation({
    mutationFn: async ({
      id,
      amount,
      method,
      reference,
      notes,
      installmentId,
      bookId,
      expenseType,
    }: {
      id: string;
      amount: number;
      method: string;
      reference?: string;
      notes?: string;
      installmentId?: string;
      bookId?: string;
      expenseType?: "credit" | "debit";
    }) => {
      const { error } = await supabase.rpc("record_debt_payment", {
        _debt_id: id,
        _payment_amount: amount,
        _method: method,
        _reference: reference || null,
        _payment_notes: notes || null,
        _target_installment: installmentId || null,
      });
      if (error) {
        if (user?.id && isMissingDebtBackend(error)) {
          await recordLegacyPayment({ id, amount, notes, userId: user.id });
        } else {
          throw error;
        }
      }

      // Optionally reflect this payment as an entry in a book.
      if (bookId && user?.id) {
        const debt = debts.find((d) => d.id === id);
        const title = notes?.trim() || debt?.description || "Debt payment";
        const { error: expenseError } = await supabase.from("expenses").insert({
          book_id: bookId,
          title,
          amount,
          date: new Date().toISOString(),
          expense_type: expenseType ?? "debit",
          payment_method: method || "cash",
          notes: notes?.trim() || null,
          tags: [],
          paid_by: user.id,
          created_by: user.id,
        });
        if (expenseError) throw expenseError;
      }
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["book-totals"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["book-detail-totals"] });
      toast.success("Payment recorded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_debt", { _debt_id: id });
      if (error) {
        if (isMissingDebtBackend(error)) {
          const { error: dueError } = await supabase
            .from("dues")
            .delete()
            .eq("id", id);
          if (dueError) throw dueError;
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast("Debt deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summaryOf = (list: Debt[]) => ({
    outstanding: list
      .filter(
        (debt) => !["rejected", "cancelled", "paid"].includes(debt.status),
      )
      .reduce((sum, debt) => sum + debt.remaining_amount, 0),
    active: list.filter((debt) =>
      ["pending", "accepted", "partially_paid", "overdue"].includes(
        debt.status,
      ),
    ).length,
    overdue: list
      .filter(
        (debt) =>
          debt.status === "overdue" ||
          (!!debt.due_date &&
            new Date(debt.due_date) < new Date() &&
            debt.remaining_amount > 0),
      )
      .reduce((sum, debt) => sum + debt.remaining_amount, 0),
  });

  return {
    debts,
    receivables,
    payables,
    receivableSummary: summaryOf(receivables),
    payableSummary: summaryOf(payables),
    isLoading: debtsQuery.isLoading,
    createDebt: createDebt.mutateAsync,
    updateDebt: updateDebt.mutateAsync,
    act: act.mutateAsync,
    recordPayment: recordPayment.mutateAsync,
    deleteDebt: deleteDebt.mutateAsync,
  };
}
