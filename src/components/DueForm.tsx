import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  buildDueSchedule,
  calculateEmiDetails,
  dueDateLabel,
  formatDueDate,
  type DueEntry,
  type DueFrequency,
} from "@/hooks/useDues";
import { CalendarClock, CalendarDays, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const TYPES: {
  value: DueFrequency;
  label: string;
  description: string;
  icon: typeof Wallet;
}[] = [
  {
    value: "one-time",
    label: "One-time",
    description: "Pay the whole amount once, by a single date.",
    icon: Wallet,
  },
  {
    value: "installment",
    label: "Installments",
    description: "Split the amount into equal parts on a repeating date.",
    icon: CalendarDays,
  },
  {
    value: "emi",
    label: "EMI / loan",
    description: "Monthly EMI with interest, fees and a fixed tenure.",
    icon: CreditCard,
  },
];

export type DuePayload = Omit<
  DueEntry,
  "id" | "createdAt" | "payments" | "people"
>;

interface DueFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  due?: DueEntry | null;
  onSubmit: (payload: DuePayload) => Promise<unknown> | void;
}

export function DueForm({ open, onOpenChange, due, onSubmit }: DueFormProps) {
  const isEdit = !!due;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState<DueFrequency>("one-time");
  const [notes, setNotes] = useState("");
  const [installments, setInstallments] = useState("3");
  const [everyMonths, setEveryMonths] = useState("1");
  const [processingFeePercent, setProcessingFeePercent] = useState("2");
  const [interestRate, setInterestRate] = useState("12");
  const [tenureMonths, setTenureMonths] = useState("12");

  useEffect(() => {
    if (!open) return;
    setTitle(due?.title ?? "");
    setAmount(
      due
        ? String(
            due.frequency === "emi" && due.emiDetails
              ? due.emiDetails.productPrice
              : due.totalAmount,
          )
        : "",
    );
    setDueDate(due?.dueDate ?? "");
    setFrequency(due?.frequency ?? "one-time");
    setNotes(due?.notes ?? "");
    setInstallments(String(due?.installmentPlan?.installments ?? 3));
    setEveryMonths(String(due?.installmentPlan?.everyMonths ?? 1));
    setProcessingFeePercent(
      String(due?.emiDetails?.processingFeePercent ?? 2),
    );
    setInterestRate(String(due?.emiDetails?.interestRate ?? 12));
    setTenureMonths(String(due?.emiDetails?.tenureMonths ?? 12));
  }, [open, due]);

  const amountValue = Number(amount) || 0;
  const emiPreview = useMemo(
    () =>
      frequency === "emi" && amountValue > 0
        ? calculateEmiDetails(
            amountValue,
            Number(processingFeePercent) || 0,
            Number(interestRate) || 0,
            Number(tenureMonths) || 1,
          )
        : null,
    [frequency, amountValue, processingFeePercent, interestRate, tenureMonths],
  );

  const totalAmount =
    frequency === "emi" && emiPreview ? emiPreview.totalPayable : amountValue;

  const installmentPlan =
    frequency === "installment"
      ? {
          installments: Math.max(1, Number(installments) || 1),
          everyMonths: Math.max(1, Number(everyMonths) || 1),
        }
      : undefined;

  const previewSchedule = useMemo(() => {
    if (!dueDate || totalAmount <= 0) return [];
    return buildDueSchedule({
      id: "preview",
      title,
      totalAmount,
      dueDate,
      frequency,
      createdAt: "",
      payments: [],
      people: [],
      emiDetails: emiPreview ?? undefined,
      installmentPlan,
    });
  }, [
    dueDate,
    totalAmount,
    title,
    frequency,
    emiPreview,
    installmentPlan?.installments,
    installmentPlan?.everyMonths,
  ]);

  const dateCopy = dueDateLabel(frequency);
  const canSave = !!title.trim() && amountValue > 0 && !!dueDate;

  const handleSubmit = async () => {
    if (!canSave) {
      toast.error("Add a title, amount and date to continue");
      return;
    }
    await onSubmit({
      title: title.trim(),
      totalAmount,
      dueDate,
      frequency,
      notes: notes.trim() || undefined,
      emiDetails: frequency === "emi" ? emiPreview ?? undefined : undefined,
      installmentPlan,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreen className="flex flex-col gap-0 p-0">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle>{isEdit ? "Edit due" : "Add a due"}</DialogTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Tell us what you owe and when it has to be paid — we build the
            payment schedule from that date.
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          {/* Type */}
          <section className="space-y-3">
            <div>
              <p className="text-sm font-semibold">How is it being paid?</p>
              <p className="text-xs text-muted-foreground">
                This decides which dates and fields matter below.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((type) => {
                const Icon = type.icon;
                const active = frequency === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFrequency(type.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <p className="mt-2 text-sm font-medium">{type.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {type.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* Basics */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="due-title">What is this due for?</Label>
              <Input
                id="due-title"
                placeholder="Phone EMI, rent, loan…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due-amount">
                {frequency === "emi" ? "Loan / product price" : "Amount owed"}
              </Label>
              <Input
                id="due-amount"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {frequency === "emi" && (
                <p className="text-[11px] text-muted-foreground">
                  Interest and fees are added on top of this.
                </p>
              )}
            </div>
          </section>

          {/* Type-specific plan fields */}
          {frequency === "installment" && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="due-installments">Number of installments</Label>
                <Input
                  id="due-installments"
                  type="number"
                  min={1}
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-every">Repeat every (months)</Label>
                <Input
                  id="due-every"
                  type="number"
                  min={1}
                  value={everyMonths}
                  onChange={(e) => setEveryMonths(e.target.value)}
                />
              </div>
            </section>
          )}

          {frequency === "emi" && (
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="due-fee">Processing fee %</Label>
                <Input
                  id="due-fee"
                  type="number"
                  min={0}
                  value={processingFeePercent}
                  onChange={(e) => setProcessingFeePercent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-interest">Interest rate % (yearly)</Label>
                <Input
                  id="due-interest"
                  type="number"
                  min={0}
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-tenure">Tenure (months)</Label>
                <Input
                  id="due-tenure"
                  type="number"
                  min={1}
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                />
              </div>
            </section>
          )}

          {/* Date with explicit purpose */}
          <section className="space-y-2 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <Label htmlFor="due-date" className="text-sm font-semibold">
                {dateCopy.label}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{dateCopy.help}</p>
            <Input
              id="due-date"
              type="date"
              className="w-full max-w-full"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </section>

          {/* Live schedule preview so the date has visible impact */}
          {previewSchedule.length > 0 && (
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {frequency === "one-time"
                    ? "What you'll pay"
                    : "Payment schedule"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Total {money(totalAmount)}
                  {previewSchedule.length > 1 &&
                    ` · ${previewSchedule.length} payments`}
                </p>
              </div>
              <div className="divide-y rounded-lg border bg-background">
                {previewSchedule.slice(0, 3).map((entry) => (
                  <div
                    key={entry.number}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {previewSchedule.length > 1
                        ? `#${entry.number} · ${formatDueDate(entry.date)}`
                        : formatDueDate(entry.date)}
                    </span>
                    <span className="font-medium">{money(entry.amount)}</span>
                  </div>
                ))}
                {previewSchedule.length > 3 && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      +{previewSchedule.length - 3} more, last on{" "}
                      {formatDueDate(
                        previewSchedule[previewSchedule.length - 1].date,
                      )}
                    </span>
                  </div>
                )}
              </div>
              {frequency === "emi" && emiPreview && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Monthly EMI
                    </p>
                    <p className="font-semibold">
                      {money(emiPreview.monthlyEmi)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Total payable
                    </p>
                    <p className="font-semibold">
                      {money(emiPreview.totalPayable)}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="space-y-2">
            <Label htmlFor="due-notes">Notes (optional)</Label>
            <Textarea
              id="due-notes"
              rows={3}
              className="resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={handleSubmit}>
            {isEdit ? "Save changes" : "Add due"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
