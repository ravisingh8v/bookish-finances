import { supabase } from "@/integrations/supabase/client";
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
  reflectBookId?: string;
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
}

const OPEN_STATUSES: DebtStatus[] = ["pending", "accepted", "partially_paid", "overdue"];
export const isCompletedDebt = (debt: Debt) =>
  ["paid", "rejected", "cancelled"].includes(debt.status);

const db = supabase as any;
const toNumber = (value: unknown) => Number(value) || 0;

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

export function calculateLoan(
  principal: number,
  rate: number,
  count: number,
  type: "flat" | "reducing",
  frequency: Frequency,
) {
  const periods = Math.max(1, count);
  const yearlyPeriods = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[frequency];
  const periodicRate = rate / 100 / yearlyPeriods;
  const emi =
    type === "reducing" && periodicRate > 0
      ? principal *
        periodicRate *
        Math.pow(1 + periodicRate, periods) /
        (Math.pow(1 + periodicRate, periods) - 1)
      : (principal + principal * (rate / 100) * (periods / yearlyPeriods)) / periods;

  return {
    emi: Math.round(emi * 100) / 100,
    interest: Math.round((emi * periods - principal) * 100) / 100,
    total: Math.round(emi * periods * 100) / 100,
  };
}

export function useDebts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["debts", user?.id];

  const debtsQuery = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_my_debts");
      if (error) throw error;
      return ((data || []) as Debt[]).map(numberize);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["debts"] });
  const debts = debtsQuery.data ?? [];
  const receivables = debts.filter(
    (debt) => debt.view_direction === "receivable" || (!debt.view_direction && debt.lender_id === user?.id),
  );
  const payables = debts.filter(
    (debt) => debt.view_direction === "payable" || (!debt.view_direction && debt.borrower_id === user?.id),
  );

  const createDebt = useMutation({
    mutationFn: async (input: DebtInput) => {
      const { reflectBookId, ...payload } = input;
      const { data, error } = await db.rpc("create_debt", { _payload: payload });
      if (error) throw error;
      // Reflect a payable debt into a book as an expense (deduction).
      if (reflectBookId && input.direction === "payable" && user?.id) {
        const { error: expenseError } = await db.from("expenses").insert({
          book_id: reflectBookId,
          title: input.title,
          amount: input.amount,
          date: new Date().toISOString().slice(0, 10),
          expense_type: "debit",
          payment_method: "cash",
          notes: input.notes || null,
          paid_by: user.id,
          created_by: user.id,
        });
        if (expenseError) throw expenseError;
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
      const { error } = await db.rpc("update_debt", { _debt_id: id, _payload: rest });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Debt updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const { error } = await db.rpc("act_on_debt", { _debt_id: id, _action_name: action });
      if (error) throw error;
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
    }: {
      id: string;
      amount: number;
      method: string;
      reference?: string;
      notes?: string;
      installmentId?: string;
    }) => {
      const { error } = await db.rpc("record_debt_payment", {
        _debt_id: id,
        _payment_amount: amount,
        _method: method,
        _reference: reference || null,
        _payment_notes: notes || null,
        _target_installment: installmentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Payment recorded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Debt deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summaryOf = (list: Debt[]) => ({
    outstanding: list
      .filter((debt) => !["rejected", "cancelled", "paid"].includes(debt.status))
      .reduce((sum, debt) => sum + debt.remaining_amount, 0),
    active: list.filter((debt) =>
      ["pending", "accepted", "partially_paid", "overdue"].includes(debt.status),
    ).length,
    overdue: list
      .filter(
        (debt) =>
          debt.status === "overdue" ||
          (!!debt.due_date && new Date(debt.due_date) < new Date() && debt.remaining_amount > 0),
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
    act: act.mutateAsync,
    recordPayment: recordPayment.mutateAsync,
    deleteDebt: deleteDebt.mutateAsync,
  };
}
