import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RecordDebtPayment } from "@/components/RecordDebtPayment";
import { canRecordPayment } from "@/lib/debtUtils";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Debt,
  DebtEditInput,
  DebtInput,
  DebtType,
  isCompletedDebt,
  useDebts,
} from "@/hooks/useDebts";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  CreditCard,
  Pencil,


  Plus,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const pretty = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const formatDebtDate = (value?: string | null) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    month: "short", day: "numeric", year: "2-digit",
  });
};
const dateInput = (value?: string | null) => value?.slice(0, 10) || "";
const statusTone: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  overdue: "bg-destructive/15 text-destructive",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  accepted: "bg-primary/15 text-primary",
  partially_paid: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const statusLabel: Record<string, string> = {
  paid: "Settled",
  accepted: "Active",
  partially_paid: "Part paid",
  pending: "Awaiting reply",
  rejected: "Declined",
  cancelled: "Cancelled",
  overdue: "Overdue",
};
const planLabel: Record<string, string> = {
  one_time: "Single payment",
  custom: "Installments",
  emi: "Loan / EMI",
};

/** Plain-English due-date helper: "Due in 3 days", "Overdue by 2 days", "Due today". */
export function dueInfo(value?: string | null) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  const date = formatDebtDate(value);
  if (days < 0)
    return {
      overdue: true,
      text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
      date,
    };
  if (days === 0) return { overdue: false, text: "Due today", date };
  if (days === 1) return { overdue: false, text: "Due tomorrow", date };
  return { overdue: false, text: `Due in ${days} days`, date };
}

function Summary({
  name,
  hint,
  outstanding,
  active,
  overdue,
}: {
  name: string;
  hint?: string;
  outstanding: number;
  active: number;
  overdue: number;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {name}
        </p>
        <p className="mt-0.5 text-base font-bold">{money(outstanding)}</p>
        <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{hint ?? `${active} active`}</span>
          {overdue > 0 && (
            <span className="shrink-0 text-destructive">
              {money(overdue)} late
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EditDebt({
  debt,
  receivable,
  update,
}: {
  debt: Debt;
  receivable: boolean;
  update: (p: DebtEditInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const initial = () => ({
    title: debt.description,
    notes: debt.notes || "",
    personAlias: debt.counterparty_alias || "",
    borrowerEmail: debt.counterparty_email || "",
    dueDate: dateInput(debt.due_date),
    amount: debt.total_amount,
    direction: (debt.view_direction ||
      debt.direction ||
      (receivable ? "receivable" : "payable")) as "receivable" | "payable",
    debtType: debt.debt_type,
    count: Math.max(2, debt.installments?.length || 2),
    firstDate:
      dateInput(debt.installments?.[0]?.due_date) ||
      dateInput(debt.loan_details?.first_emi_date) ||
      "",
    fee: debt.loan_details?.processing_fee_percent || 0,
    interest: debt.loan_details?.interest_rate || 0,
    months:
      debt.loan_details?.number_of_emis ||
      Math.max(1, debt.installments?.length || 6),
  });
  const [f, setF] = useState(initial);
  const emi = useMemo(() => {
    const fee = (f.amount * f.fee) / 100,
      interest = ((f.amount * f.interest) / 100) * (f.months / 12),
      total = f.amount + fee + interest;
    return { fee, interest, total, monthly: total / f.months };
  }, [f.amount, f.fee, f.interest, f.months]);
  const installments = useMemo(() => {
    if (!f.firstDate) return [];
    const each = Math.floor((f.amount * 100) / f.count) / 100;
    return Array.from({ length: f.count }, (_, i) => ({
      amount: i === f.count - 1 ? f.amount - each * i : each,
      due_date: monthDate(f.firstDate, i),
    }));
  }, [f.amount, f.count, f.firstDate]);
  const valid =
    f.title.trim() &&
    f.amount >= debt.paid_amount &&
    f.amount > 0 &&
    (f.debtType !== "one_time" || f.dueDate) &&
    (f.debtType === "one_time" || f.firstDate);
  const save = async () => {
    const effectiveDueDate = f.debtType === "one_time" ? f.dueDate : f.firstDate;
    await update({
      id: debt.id,
      title: f.title,
      notes: f.notes,
      personAlias: f.personAlias,
      borrowerEmail: f.borrowerEmail,
      dueDate: effectiveDueDate,
      amount: f.debtType === "emi" ? emi.total : f.amount,
      direction: f.direction,
      debtType: f.debtType,
      installments: f.debtType === "custom" ? installments : undefined,
      loan:
        f.debtType === "emi"
          ? {
              principal_amount: f.amount,
              processing_fee_percent: f.fee,
              processing_fee: emi.fee,
              interest_rate: f.interest,
              interest_type: "flat",
              number_of_emis: f.months,
              emi_amount: emi.monthly,
              total_interest: emi.interest,
              total_repayable_amount: emi.total,
              payment_frequency: "monthly",
              loan_start_date:
                debt.loan_details?.loan_start_date ||
                new Date().toISOString().slice(0, 10),
              first_emi_date: f.firstDate,
              automatic_calculation: true,
            }
          : undefined,
    });
    setOpen(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(initial());
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent fullscreen className="flex flex-col">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Edit debt</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-xl space-y-5">
          <Field label="Direction">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <Button
                variant={f.direction === "receivable" ? "default" : "ghost"}
                size="sm"
                onClick={() => setF({ ...f, direction: "receivable" })}
              >
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                I’m owed
              </Button>
              <Button
                variant={f.direction === "payable" ? "default" : "ghost"}
                size="sm"
                onClick={() => setF({ ...f, direction: "payable" })}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />I owe
              </Button>
            </div>
          </Field>
          <Field label="Title">
            <Input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              value={f.amount || ""}
              onChange={(e) => setF({ ...f, amount: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              {debt.paid_amount > 0 &&
                `Already paid ${money(debt.paid_amount)}. Amount can't be lower.`}
              {isCompletedDebt(debt) &&
                " Increasing the amount reopens this debt."}
            </p>
          </Field>
          <Field label="Payment type">
            <div className="grid grid-cols-3 gap-2">
              {(["one_time", "custom", "emi"] as DebtType[]).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={f.debtType === t ? "default" : "outline"}
                  onClick={() => setF({ ...f, debtType: t })}
                >
                  {t === "custom" ? "Installments" : pretty(t)}
                </Button>
              ))}
            </div>
          </Field>
          {f.debtType === "one_time" && (
            <Field label="Due date">
              <Input
                type="date"
                value={f.dueDate}
                onChange={(e) => setF({ ...f, dueDate: e.target.value })}
              />
            </Field>
          )}
          {f.debtType === "custom" && (
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <Field label="Installments">
                  <Input
                    type="number"
                    min="2"
                    value={f.count}
                    onChange={(e) =>
                      setF({ ...f, count: Math.max(2, Number(e.target.value)) })
                    }
                  />
                </Field>
                <Field label="First due date">
                  <Input
                    type="date"
                    value={f.firstDate}
                    onChange={(e) => setF({ ...f, firstDate: e.target.value })}
                  />
                </Field>
                <p className="col-span-2 text-sm">
                  {f.count} × about {money(installments[0]?.amount || 0)}
                </p>
              </CardContent>
            </Card>
          )}
          {f.debtType === "emi" && (
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <Field label="Processing fee %">
                  <Input
                    type="number"
                    value={f.fee}
                    onChange={(e) =>
                      setF({ ...f, fee: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Interest % yearly">
                  <Input
                    type="number"
                    value={f.interest}
                    onChange={(e) =>
                      setF({ ...f, interest: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Number of months">
                  <Input
                    type="number"
                    min="1"
                    value={f.months}
                    onChange={(e) =>
                      setF({
                        ...f,
                        months: Math.max(1, Number(e.target.value)),
                      })
                    }
                  />
                </Field>
                <Field label="First EMI date">
                  <Input
                    type="date"
                    value={f.firstDate}
                    onChange={(e) => setF({ ...f, firstDate: e.target.value })}
                  />
                </Field>
                <div className="col-span-2 grid grid-cols-2 rounded-lg bg-muted p-3 text-sm">
                  <span>Monthly EMI</span>
                  <b className="text-right">{money(emi.monthly)}</b>
                  <span>Total payable</span>
                  <b className="text-right">{money(emi.total)}</b>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <Label>Person (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  No account search. Email links automatically if they join later.
                </p>
              </div>
              <Field label="Alias / name">
                <Input
                  placeholder="e.g. Rahul"
                  value={f.personAlias}
                  onChange={(e) => setF({ ...f, personAlias: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="rahul@example.com"
                  value={f.borrowerEmail}
                  onChange={(e) => setF({ ...f, borrowerEmail: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>
          <Field label="Notes">
            <Textarea
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
            />
          </Field>
          </div>
        </div>
        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DebtCard({
  debt,
  receivable,
  act,
  remove,
  update,
}: {
  debt: Debt;
  receivable: boolean;
  act: (a: string) => void;
  remove: () => void;
  update: (p: DebtEditInput) => Promise<unknown>;
}) {
  const nav = useNavigate(),
    { user } = useAuth();
  const person = receivable ? debt.borrower : debt.lender;
  const alias =
    debt.counterparty_alias ||
    person?.display_name ||
    person?.email ||
    "Personal tracking";
  const shared = Boolean(debt.counterparty_email || person),
    mine = !debt.created_by || debt.created_by === user?.id;
  const pct = debt.total_amount
      ? Math.min(100, (debt.paid_amount / debt.total_amount) * 100)
      : 0,
    next = debt.installments?.find((i) => i.remaining_amount > 0);
  const dueDate = debt.due_date || next?.due_date;
  const overdue =
    !!dueDate &&
    debt.remaining_amount > 0 &&
    !isCompletedDebt(debt) &&
    new Date(`${dueDate.slice(0, 10)}T23:59:59`) < new Date();
  const due = !isCompletedDebt(debt) ? dueInfo(dueDate) : null;
  const settled = isCompletedDebt(debt);
  const statusKey = overdue ? "overdue" : debt.status;
  return (
    <Card
      className={`flex flex-col transition-all hover:shadow-sm ${
        overdue ? "border-destructive/50 bg-destructive/5" : ""
      }`}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Who + what */}
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="text-xs">
              {alias[0]?.toUpperCase() || <UserRound className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {debt.description}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {receivable ? "Owed to you by" : "You owe"}{" "}
              <span className="font-medium text-foreground">{alias}</span>
            </p>
          </div>
          <Badge
            className={`shrink-0 px-2 py-0.5 text-[10px] font-medium ${statusTone[statusKey] ?? ""}`}
          >
            {statusLabel[statusKey] ?? pretty(debt.status)}
          </Badge>
        </div>

        {/* The number that matters */}
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {settled ? "Settled amount" : "Still outstanding"}
              </p>
              <p className="text-xl font-bold leading-tight">
                {money(settled ? debt.total_amount : debt.remaining_amount)}
              </p>
            </div>
            <p className="text-right text-[11px] text-muted-foreground">
              <span className="font-medium text-emerald-600">
                {money(debt.paid_amount)}
              </span>{" "}
              paid of {money(debt.total_amount)}
            </p>
          </div>
          <Progress value={pct} className="mt-2 h-1.5" />
        </div>

        {/* Plan + due date */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <WalletCards className="h-3 w-3" />
            {planLabel[debt.debt_type] ?? pretty(debt.debt_type)}
          </span>
          {due && (
            <span
              className={`inline-flex items-center gap-1 ${
                due.overdue ? "font-semibold text-destructive" : ""
              }`}
            >
              <Calendar className="h-3 w-3" />
              {due.text} · {due.date}
            </span>
          )}
          {!due && dueDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDebtDate(dueDate)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-9 flex-1"
            onClick={() => nav(`/debts/${debt.id}`)}
          >
            Details
          </Button>
          {canRecordPayment(debt) && (
            <RecordDebtPayment
              debt={debt}
              trigger={
                <Button size="sm" className="h-9 flex-1">
                  <CreditCard className="mr-1 h-3.5 w-3.5" />
                  {receivable ? "Received" : "Pay"}
                </Button>
              }
            />
          )}

          {!receivable && debt.status === "pending" && shared && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => act("accept")}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={() => act("reject")}
              >
                Reject
              </Button>
            </>
          )}
          {receivable && debt.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => act("cancel")}
            >
              Cancel
            </Button>
          )}
          {mine && (
            <EditDebt debt={debt} receivable={receivable} update={update} />
          )}
          {mine && (
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 text-muted-foreground sm:hover:text-destructive"
              onClick={remove}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type Form = DebtInput & {
  count: number;
  firstDate: string;
  fee: number;
  interest: number;
  months: number;
};
const blank: Form = {
  direction: "receivable",
  title: "",
  personAlias: "",
  borrowerEmail: "",
  debtType: "one_time",
  amount: 0,
  dueDate: "",
  notes: "",
  count: 2,
  firstDate: "",
  fee: 0,
  interest: 0,
  months: 6,
};
const monthDate = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

function AddDebt({ create }: { create: (p: DebtInput) => Promise<unknown> }) {
  const [open, setOpen] = useState(false),
    [f, setF] = useState(blank);
  const emi = useMemo(() => {
    const fee = (f.amount * f.fee) / 100,
      interest = ((f.amount * f.interest) / 100) * (f.months / 12),
      total = f.amount + fee + interest;
    return { fee, interest, total, monthly: total / f.months };
  }, [f.amount, f.fee, f.interest, f.months]);
  const installments = useMemo(() => {
    if (!f.firstDate) return [];
    const each = Math.floor((f.amount * 100) / f.count) / 100;
    return Array.from({ length: f.count }, (_, i) => ({
      amount: i === f.count - 1 ? f.amount - each * i : each,
      due_date: monthDate(f.firstDate, i),
    }));
  }, [f.amount, f.count, f.firstDate]);
  const valid =
    f.title.trim() &&
    f.amount > 0 &&
    (f.debtType !== "one_time" || f.dueDate) &&
    (f.debtType === "one_time" || f.firstDate);
  const save = async () => {
    await create({
      ...f,
      description: f.title,
      borrowerEmail: f.borrowerEmail?.trim() || undefined,
      personAlias: f.personAlias?.trim() || undefined,
      amount: f.debtType === "emi" ? emi.total : f.amount,
      installments: f.debtType === "custom" ? installments : undefined,
      loan:
        f.debtType === "emi"
          ? {
              principal_amount: f.amount,
              processing_fee_percent: f.fee,
              processing_fee: emi.fee,
              interest_rate: f.interest,
              interest_type: "flat",
              number_of_emis: f.months,
              emi_amount: emi.monthly,
              total_interest: emi.interest,
              total_repayable_amount: emi.total,
              payment_frequency: "monthly",
              loan_start_date: new Date().toISOString().slice(0, 10),
              first_emi_date: f.firstDate,
              automatic_calculation: true,
            }
          : undefined,
    });
    setOpen(false);
    setF(blank);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Debt
        </Button>
      </DialogTrigger>
      <DialogContent fullscreen className="flex flex-col">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Add debt</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-xl space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <Button
                variant={f.direction === "receivable" ? "default" : "ghost"}
                onClick={() => setF({ ...f, direction: "receivable" })}
              >
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                I’m owed
              </Button>
              <Button
                variant={f.direction === "payable" ? "default" : "ghost"}
                onClick={() => setF({ ...f, direction: "payable" })}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />I owe
              </Button>
            </div>
            <Field label="Title">
              <Input
                placeholder="e.g. Laptop loan"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                value={f.amount || ""}
                onChange={(e) => setF({ ...f, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Payment type">
              <div className="grid grid-cols-3 gap-2">
                {(["one_time", "custom", "emi"] as DebtType[]).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={f.debtType === t ? "default" : "outline"}
                    onClick={() => setF({ ...f, debtType: t })}
                  >
                    {t === "custom" ? "Installments" : pretty(t)}
                  </Button>
                ))}
              </div>
            </Field>
            {f.debtType === "one_time" && (
              <Field label="Due date">
                <Input
                  type="date"
                  value={f.dueDate}
                  onChange={(e) => setF({ ...f, dueDate: e.target.value })}
                />
              </Field>
            )}
            {f.debtType === "custom" && (
              <Card>
                <CardContent className="grid grid-cols-2 gap-3 p-4">
                  <Field label="Installments">
                    <Input
                      type="number"
                      min="2"
                      value={f.count}
                      onChange={(e) =>
                        setF({
                          ...f,
                          count: Math.max(2, Number(e.target.value)),
                        })
                      }
                    />
                  </Field>
                  <Field label="First due date">
                    <Input
                      type="date"
                      value={f.firstDate}
                      onChange={(e) =>
                        setF({ ...f, firstDate: e.target.value })
                      }
                    />
                  </Field>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Equal payments on the same day each month.
                  </p>
                  {installments.length > 0 && (
                    <p className="col-span-2 text-sm">
                      {f.count} × about {money(installments[0].amount)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {f.debtType === "emi" && (
              <Card>
                <CardContent className="grid grid-cols-2 gap-3 p-4">
                  <Field label="Processing fee %">
                    <Input
                      type="number"
                      value={f.fee}
                      onChange={(e) =>
                        setF({ ...f, fee: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Interest % yearly">
                    <Input
                      type="number"
                      value={f.interest}
                      onChange={(e) =>
                        setF({ ...f, interest: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Number of months">
                    <Input
                      type="number"
                      min="1"
                      value={f.months}
                      onChange={(e) =>
                        setF({
                          ...f,
                          months: Math.max(1, Number(e.target.value)),
                        })
                      }
                    />
                  </Field>
                  <Field label="First EMI date">
                    <Input
                      type="date"
                      value={f.firstDate}
                      onChange={(e) =>
                        setF({ ...f, firstDate: e.target.value })
                      }
                    />
                  </Field>
                  <div className="col-span-2 grid grid-cols-2 rounded-lg bg-muted p-3 text-sm">
                    <span>Monthly EMI</span>
                    <b className="text-right">{money(emi.monthly)}</b>
                    <span>Total payable</span>
                    <b className="text-right">{money(emi.total)}</b>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <Label>Person (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    No account search. Email links automatically if they join
                    later.
                  </p>
                </div>
                <Field label="Alias / name">
                  <Input
                    placeholder="e.g. Rahul"
                    value={f.personAlias}
                    onChange={(e) =>
                      setF({ ...f, personAlias: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    placeholder="rahul@example.com"
                    value={f.borrowerEmail}
                    onChange={(e) =>
                      setF({ ...f, borrowerEmail: e.target.value })
                    }
                  />
                </Field>
              </CardContent>
            </Card>
            <Field label="Notes (optional)">
              <Textarea
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            Save debt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DebtTab({
  items,
  receivable,
  d,
}: {
  items: Debt[];
  receivable: boolean;
  d: ReturnType<typeof useDebts>;
}) {
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((x) => !isCompletedDebt(x));
  const done = items.filter(isCompletedDebt);
  const card = (x: Debt) => (
    <DebtCard
      key={x.id}
      debt={x}
      receivable={receivable}
      act={(a) => d.act({ id: x.id, action: a })}
      remove={() => d.deleteDebt(x.id)}
      update={d.updateDebt}
    />
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {open.length ? (
          open.map(card)
        ) : (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center p-10">
              <WalletCards className="mb-2 h-8 w-8 text-muted-foreground" />
              <p>No active {receivable ? "receivables" : "payables"}</p>
            </CardContent>
          </Card>
        )}
      </div>
      {done.length > 0 && (
        <Collapsible open={showDone} onOpenChange={setShowDone}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span>
                Completed &amp; closed{" "}
                <Badge variant="secondary" className="ml-2">
                  {done.length}
                </Badge>
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showDone ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <p className="mb-3 text-xs text-muted-foreground">
              Paid, rejected or cancelled debts. Editing one (e.g. raising its
              amount) moves it back to the active list.
            </p>
            <div className="grid gap-3 opacity-90 md:grid-cols-2 xl:grid-cols-3">
              {done.map(card)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default function Debts() {
  const d = useDebts(),
    [tab, setTabState] = useState(
      () => localStorage.getItem("debts-active-tab") || "receivables",
    ),
    net = d.receivableSummary.outstanding - d.payableSummary.outstanding;
  const setTab = (value: string) => {
    setTabState(value);
    localStorage.setItem("debts-active-tab", value);
  };
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex justify-between">
          <div>
            <h1 className="text-2xl font-bold">Debts</h1>
            <p className="text-sm text-muted-foreground">
              Everything you owe and are owed.
            </p>
          </div>
          <AddDebt create={d.createDebt} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Summary name="Receivables" {...d.receivableSummary} />
          <Summary name="Payables" {...d.payableSummary} />
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Net balance
              </p>
              <p
                className={`mt-0.5 text-base font-bold ${net >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {money(net)}
              </p>
            </CardContent>
          </Card>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid h-12 w-full grid-cols-2">
            <TabsTrigger value="receivables">
              Receivables{" "}
              <Badge className="ml-2" variant="secondary">
                {d.receivables.filter((x) => !isCompletedDebt(x)).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="payables">
              Payables{" "}
              <Badge className="ml-2" variant="secondary">
                {d.payables.filter((x) => !isCompletedDebt(x)).length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="receivables" className="mt-4">
            <DebtTab items={d.receivables} receivable d={d} />
          </TabsContent>
          <TabsContent value="payables" className="mt-4">
            <DebtTab items={d.payables} receivable={false} d={d} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
