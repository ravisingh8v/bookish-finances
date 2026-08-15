import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DueForm, type DuePayload } from "@/components/DueForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildDueSchedule,
  daysUntil,
  dueDateLabel,
  formatDueDate,
  getNextScheduleEntry,
  useDues,
} from "@/hooks/useDues";
import { ArrowLeft, CalendarClock, CheckCircle2, Circle, Pencil, ShieldAlert, Trash, UserPlus } from "lucide-react";
import { toast } from "sonner";


function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DueDetail() {
  const { dueId } = useParams<{ dueId: string }>();
  const navigate = useNavigate();
  const { getDueById, addPayment, deletePayment, addPerson, removePerson, updatePersonRole, deleteDue, updateDue } = useDues();
  const due = getDueById(dueId ?? "");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [editOpen, setEditOpen] = useState(false);


  const payments = due?.payments ?? [];
  const people = due?.people ?? [];
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = due ? due.totalAmount - paid : 0;

  const summary = useMemo(
    () => [
      { label: "Total", value: due ? formatCurrency(due.totalAmount) : "-" },
      { label: "Paid", value: due ? formatCurrency(paid) : "-" },
      { label: "Outstanding", value: due ? formatCurrency(outstanding) : "-" },
    ],
    [due, paid, outstanding],
  );

  if (!due) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-3xl bg-card p-8 text-center">
          <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Due not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">The due you are looking for was not found.</p>
          <Button className="mt-6" onClick={() => navigate("/dues")}>Back to dues</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/dues")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-display font-bold">{due.title}</h1>
              <Badge variant="secondary">
                {due.frequency === "emi"
                  ? "EMI"
                  : due.frequency === "installment"
                    ? "Installments"
                    : "One-time"}
              </Badge>
            </div>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {nextEntry
                ? `Next payment ${formatCurrency(nextEntry.amount)} on ${formatDueDate(nextEntry.date)}${
                    nextDays === null
                      ? ""
                      : nextDays < 0
                        ? ` · overdue by ${Math.abs(nextDays)} day${Math.abs(nextDays) === 1 ? "" : "s"}`
                        : nextDays === 0
                          ? " · due today"
                          : ` · in ${nextDays} day${nextDays === 1 ? "" : "s"}`
                  }`
                : "All payments completed"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dateCopy.label}: {formatDueDate(due.dueDate)} — {dateCopy.help}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button variant="destructive"  onClick={() => {
              if (confirm("Delete this due?")) {
                deleteDue(due.id);
                navigate("/dues");
              }
            }}>
              <Trash className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {summary.map((item) => (
            <Card key={item.label} className="glass">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-lg font-semibold">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {schedule.length > 0 && (
          <Card className="glass">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Payment schedule</h2>
                <p className="text-xs text-muted-foreground">
                  Built from the {dateCopy.label.toLowerCase()}
                </p>
              </div>
              <div className="divide-y rounded-xl border">
                {schedule.map((entry) => {
                  const covered = schedule
                    .slice(0, entry.number)
                    .reduce((s, e) => s + e.amount, 0);
                  const isPaid = paid >= covered - 0.01;
                  const isNext = nextEntry?.number === entry.number;
                  return (
                    <div
                      key={entry.number}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${isNext ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isPaid ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">
                            {schedule.length > 1
                              ? `Payment ${entry.number} of ${schedule.length}`
                              : "Full payment"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDueDate(entry.date)}
                            {isNext ? " · next up" : ""}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(entry.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}


        {due.emiDetails ? (
          <Card className="glass">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-lg font-semibold">EMI details</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Product price</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.productPrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Processing fee</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.processingFeeAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">GST on fee</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.gstOnProcessing)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Interest</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.totalInterest)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">GST on interest</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.gstOnInterest)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total payable</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.totalPayable)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly EMI</p>
                  <p className="font-semibold mt-1">{formatCurrency(due.emiDetails.monthlyEmi)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tenure</p>
                  <p className="font-semibold mt-1">{due.emiDetails.tenureMonths} months</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="glass">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Add payment</h2>
                  <p className="text-sm text-muted-foreground">Record part payments against this due.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Amount</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-notes">Notes</Label>
                  <Input
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>
              <Button
                disabled={!paymentAmount.trim() || Number(paymentAmount) <= 0}
                onClick={() => {
                  const value = Number(paymentAmount);
                  if (Number.isNaN(value) || value <= 0) {
                    toast.error("Enter a valid payment amount");
                    return;
                  }
                  addPayment(due.id, value, paymentNotes);
                  setPaymentAmount("");
                  setPaymentNotes("");
                }}
              >
                Add Payment
              </Button>
              <div className="space-y-2">
                <h3 className="text-base font-semibold">Payment history</h3>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                  <div className="space-y-3">
                    {due.payments.map((payment) => (
                      <div key={payment.id} className="rounded-xl bg-muted/70 p-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold">{formatCurrency(payment.amount)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(payment.date).toLocaleString()}</p>
                          {payment.notes ? <p className="text-sm text-muted-foreground">{payment.notes}</p> : null}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deletePayment(due.id, payment.id)}>
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Invite people</h2>
                  <p className="text-sm text-muted-foreground">Add viewers or collaborators for this due entry.</p>
                </div>
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Role</Label>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "editor" | "viewer")}> 
                    <SelectTrigger id="invite-role" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => {
                    addPerson(due.id, inviteEmail, inviteRole);
                    setInviteEmail("");
                    setInviteRole("viewer");
                  }}
                >
                  Invite
                </Button>
              </div>
              <div className="space-y-3">
                <h3 className="text-base font-semibold">Invited people</h3>
                {people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invited members.</p>
                ) : (
                  <div className="space-y-2">
                    {people.map((person) => (
                      <div key={person.id} className="rounded-xl bg-muted/70 p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{person.email}</p>
                          <p className="text-xs text-muted-foreground">{person.role}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={person.role}
                            onValueChange={(value) => updatePersonRole(due.id, person.id, value as "editor" | "viewer")}
                          >
                            <SelectTrigger className="h-9 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="sm" onClick={() => removePerson(due.id, person.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
