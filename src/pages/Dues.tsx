import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateEmiDetails, useDues, DueFrequency } from "@/hooks/useDues";
import { Plus, Wallet } from "lucide-react";

const FREQUENCIES: { value: DueFrequency; label: string }[] = [
  { value: "one-time", label: "One-time" },
  { value: "installment", label: "Installment" },
  { value: "emi", label: "EMI" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatus(totalAmount: number, paid: number) {
  return paid >= totalAmount ? "Paid" : "Pending";
}

export default function Dues() {
  const navigate = useNavigate();
  const { dues, totals, addDue, deleteDue } = useDues();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState<DueFrequency>("one-time");
  const [notes, setNotes] = useState("");
  const [processingFeePercent, setProcessingFeePercent] = useState("2");
  const [interestRate, setInterestRate] = useState("12");
  const [tenureMonths, setTenureMonths] = useState("12");

  const amountValue = Number(amount);
  const emiPreview =
    frequency === "emi" && amountValue > 0
      ? calculateEmiDetails(amountValue, Number(processingFeePercent), Number(interestRate), Number(tenureMonths))
      : null;

  const canSave =
    title.trim() &&
    amount.trim() &&
    dueDate.trim() &&
    (frequency !== "emi" || (processingFeePercent.trim() && interestRate.trim() && tenureMonths.trim()));

  const debtSummary = useMemo(
    () => [
      { label: "Total dues", value: totals.count },
      { label: "Outstanding", value: formatCurrency(totals.outstanding) },
      { label: "Paid", value: formatCurrency(totals.paid) },
    ],
    [totals],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Dues</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Track pending dues, partial payments, and EMI schedules in one place.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(value) => setOpen(value)}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Due
              </Button>
            </DialogTrigger>
            <DialogContent fullscreen className="flex flex-col">
              <DialogHeader className="pb-4 sticky top-0 bg-background/95 backdrop-blur-sm pt-2 px-4 sm:px-6 z-40 border-b">
                <DialogTitle>Add Due</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="due-title">Title</Label>
                    <Input
                      id="due-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due-amount">Amount</Label>
                    <Input
                      id="due-amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      type="number"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="due-date">Due date</Label>
                    <Input
                      id="due-date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due-frequency">Frequency</Label>
                    <Select
                      value={frequency}
                      onValueChange={(value) => setFrequency(value as DueFrequency)}
                    >
                      <SelectTrigger id="due-frequency" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((entry) => (
                          <SelectItem key={entry.value} value={entry.value}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-notes">Notes</Label>
                  <Textarea
                    id="due-notes"
                    rows={4}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                {frequency === "emi" ? (
                  <div className="space-y-4 rounded-3xl border border-muted/70 bg-muted/10 p-4">
                    <h3 className="text-base font-semibold">EMI details</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="processing-fee">Processing fee %</Label>
                        <Input
                          id="processing-fee"
                          type="number"
                          min={0}
                          value={processingFeePercent}
                          onChange={(event) => setProcessingFeePercent(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="interest-rate">Interest rate %</Label>
                        <Input
                          id="interest-rate"
                          type="number"
                          min={0}
                          value={interestRate}
                          onChange={(event) => setInterestRate(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tenure-months">Tenure (months)</Label>
                        <Input
                          id="tenure-months"
                          type="number"
                          min={1}
                          value={tenureMonths}
                          onChange={(event) => setTenureMonths(event.target.value)}
                        />
                      </div>
                    </div>
                    {emiPreview ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-background p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Monthly EMI</p>
                          <p className="mt-2 text-lg font-semibold">{formatCurrency(emiPreview.monthlyEmi)}</p>
                        </div>
                        <div className="rounded-2xl bg-background p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total payable</p>
                          <p className="mt-2 text-lg font-semibold">{formatCurrency(emiPreview.totalPayable)}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!canSave}
                  onClick={() => {
                    if (!canSave) return;
                    const newDue = {
                      title: title.trim(),
                      totalAmount:
                        frequency === "emi" && emiPreview
                          ? emiPreview.totalPayable
                          : Number(amount),
                      dueDate,
                      frequency,
                      notes: notes.trim() || undefined,
                      emiDetails: frequency === "emi" ? emiPreview ?? undefined : undefined,
                    } as const;
                    addDue(newDue);
                    setTitle("");
                    setAmount("");
                    setDueDate("");
                    setFrequency("one-time");
                    setNotes("");
                    setProcessingFeePercent("2");
                    setInterestRate("12");
                    setTenureMonths("12");
                    setOpen(false);
                  }}
                >
                  Save Due
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {debtSummary.map((item) => (
            <Card key={item.label} className="glass">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="font-display font-bold text-lg">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          {dues.length === 0 ? (
            <Card className="glass">
              <CardContent className="p-8 text-center">
                <Wallet className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No dues tracked yet. Add dues to manage payments and EMIs.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {dues.map((due) => {
                const paid = (due.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
                const status = getStatus(due.totalAmount, paid);
                return (
                  <Card key={due.id} className="glass">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold">{due.title}</h2>
                            <span className="rounded-full px-2 py-1 text-xs font-medium bg-muted text-muted-foreground">
                              {status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {formatCurrency(due.totalAmount)} due on {due.dueDate}
                          </p>
                          {due.notes ? (
                            <p className="mt-2 text-sm text-muted-foreground">{due.notes}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/dues/${due.id}`}>View</Link>
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteDue(due.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-muted/70 p-3">
                          <p className="text-sm text-muted-foreground">Paid</p>
                          <p className="font-semibold">{formatCurrency(paid)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/70 p-3">
                          <p className="text-sm text-muted-foreground">Outstanding</p>
                          <p className="font-semibold">{formatCurrency(due.totalAmount - paid)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/70 p-3">
                          <p className="text-sm text-muted-foreground">Payments</p>
                          <p className="font-semibold">{due.payments.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
