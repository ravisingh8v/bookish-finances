import { DashboardLayout } from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { useSplitBills, type SplitParticipant } from "@/hooks/useSplitBills";
import { formatINR } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  Plus,
  SplitSquareHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY"];
const getCurrencySymbol = (c: string) =>
  ({ INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥" })[c] ?? c + " ";

function SectionTitle({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

export default function SplitBills() {
  const { user, profile } = useAuth();
  const {
    splits,
    isLoading,
    createSplit,
    editSplit,
    deleteSplit,
    deletePayment,
    removeParticipant,

    toggleSettled,
    createPayment,
    paymentsEnabled,
  } = useSplitBills();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [activeParticipant, setActiveParticipant] =
    useState<SplitParticipant | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setCurrency("INR");
    setNotes("");
    setEmailInput("");
    setNameInput("");
    setEmails([]);
    setNames({});
    setActiveParticipant(null);
    setPaymentAmount("");
    setPaymentNote("");
  };

  const openEdit = (split: (typeof splits)[number]) => {
    setEditingId(split.id);
    setTitle(split.title);
    setAmount(String(split.total_amount));
    setCurrency(split.currency);
    setNotes(split.notes ?? "");
    setEmailInput("");
    setNameInput("");
    setEmails(split.participants.map((p) => p.email));
    setNames(
      Object.fromEntries(
        split.participants
          .filter((p) => p.name && p.name.trim())
          .map((p) => [p.email, p.name as string]),
      ),
    );
    setOpen(true);
  };

  const toggleLogs = (participantId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const addEmail = () => {
    const e = emailInput.toLowerCase().trim();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Enter a valid email");
      return;
    }
    if (emails.includes(e)) {
      toast.error("Email already added");
      return;
    }
    setEmails((prev) => [...prev, e]);
    const n = nameInput.trim();
    if (n) setNames((prev) => ({ ...prev, [e]: n }));
    setEmailInput("");
    setNameInput("");
  };

  const headCount = emails.length + 1;
  const perHead =
    amount && !isNaN(Number(amount)) && Number(amount) > 0
      ? Number(amount) / headCount
      : 0;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Valid amount is required");
      return;
    }
    if (emails.length === 0) {
      toast.error("Add at least one person to split with");
      return;
    }
    try {
      if (editingId) {
        await editSplit.mutateAsync({
          id: editingId,
          title: title.trim(),
          total_amount: Number(amount),
          currency,
          emails,
          names,
          notes: notes.trim() || undefined,
        });
      } else {
        await createSplit.mutateAsync({
          title: title.trim(),
          total_amount: Number(amount),
          currency,
          emails,
          names,
          notes: notes.trim() || undefined,
        });
      }
      setOpen(false);
      resetForm();
    } catch {}
  };

  const openPaymentModal = (participant: SplitParticipant) => {
    setActiveParticipant(participant);
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentDialogOpen(true);
  };

  const handleCreatePayment = async () => {
    if (!activeParticipant) return;
    const parsedAmount = Number(paymentAmount);
    if (!paymentAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (parsedAmount > activeParticipant.remaining_amount) {
      toast.error("Payment cannot exceed remaining share amount.");
      return;
    }
    try {
      await createPayment.mutateAsync({
        participantId: activeParticipant.id,
        amount: parsedAmount,
        note: paymentNote.trim() || undefined,
      });
      setPaymentDialogOpen(false);
      setActiveParticipant(null);
      setPaymentAmount("");
      setPaymentNote("");
      toast.success("Payment recorded");
    } catch (error) {
      // error toast is handled by hook
    }
  };

  const activeSplitCurrency = activeParticipant
    ? getCurrencySymbol(
        splits.find((split) =>
          split.participants.some(
            (participant) => participant.id === activeParticipant.id,
          ),
        )?.currency ?? "INR",
      )
    : "";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Split Bills
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Share an expense with friends and track who has paid you back.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              if (!v) resetForm();
              setOpen(v);
            }}
          >
            <DialogTrigger asChild>
              <Button className="h-10 shrink-0 gap-2 px-3 sm:px-4">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New split</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 p-0">
              <DialogHeader className="border-b px-5 py-4">
                <DialogTitle>
                  {editingId ? "Edit split bill" : "New split bill"}
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {/* 1 — Bill details */}
                <section className="space-y-4">
                  <SectionTitle
                    step={1}
                    title="Bill details"
                    hint="What was paid for and how much."
                  />
                  <div className="space-y-4 pl-9">
                    <div className="space-y-2">
                      <Label htmlFor="split-title">Title</Label>
                      <Input
                        id="split-title"
                        placeholder="Dinner, trip, rent…"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_7rem] gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="split-amount">Total amount</Label>
                        <Input
                          id="split-amount"
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="split-currency">Currency</Label>
                        <Select value={currency} onValueChange={setCurrency}>
                          <SelectTrigger id="split-currency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* 2 — People */}
                <section className="space-y-4">
                  <SectionTitle
                    step={2}
                    title="Who is splitting?"
                    hint="You're included automatically. Add everyone else by email."
                  />
                  <div className="space-y-3 pl-9">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        id="split-name"
                        placeholder="Name (optional)"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addEmail();
                          }
                        }}
                      />
                      <Input
                        id="split-email"
                        type="email"
                        placeholder="friend@example.com"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addEmail();
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={addEmail}
                    >
                      <Plus className="h-4 w-4" />
                      Add person
                    </Button>

                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        People in this split ({headCount})
                      </p>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2">
                          <span className="truncate text-sm">
                            You{profile?.email ? ` · ${profile.email}` : ""}
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            Payer
                          </Badge>
                        </div>
                        {emails.map((e) => (
                          <div
                            key={e}
                            className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2"
                          >
                            <div className="min-w-0">
                              {names[e] && (
                                <p className="truncate text-sm">{names[e]}</p>
                              )}
                              <p
                                className={`truncate ${names[e] ? "text-[11px] text-muted-foreground" : "text-sm"}`}
                              >
                                {e}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground"
                              onClick={() => {
                                setEmails((prev) => prev.filter((x) => x !== e));
                                setNames((prev) => {
                                  const next = { ...prev };
                                  delete next[e];
                                  return next;
                                });
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {emails.length === 0 && (
                          <p className="px-1 py-2 text-xs text-muted-foreground">
                            No one added yet — add at least one person.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* 3 — Summary */}
                <section className="space-y-4">
                  <SectionTitle
                    step={3}
                    title="Summary"
                    hint="Everyone pays an equal share."
                  />
                  <div className="space-y-4 pl-9">
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-medium">
                          {getCurrencySymbol(currency)}
                          {formatINR(Number(amount) || 0)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Split between
                        </span>
                        <span className="font-medium">{headCount} people</span>
                      </div>
                      <Separator className="my-3" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Each pays</span>
                        <span className="text-lg font-bold">
                          {getCurrencySymbol(currency)}
                          {formatINR(perHead)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="split-notes">Notes (optional)</Label>
                      <Textarea
                        id="split-notes"
                        rows={3}
                        className="resize-none"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <DialogFooter className="gap-2 border-t px-5 py-4 sm:gap-2">
                <Button
                  variant="outline"
                  className="sm:w-auto"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  loading={createSplit.isPending || editSplit.isPending}
                >
                  {editingId ? "Save changes" : "Create split"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!paymentsEnabled && (
          <Card className="glass border-warning/40 bg-warning/10">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-warning">
                Split payment activity unavailable
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Partial payment tracking is disabled because the required
                database schema is not available yet. Apply the latest migration
                and refresh the page to enable payments.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : splits.length === 0 ? (
          <Card className="glass">
            <CardContent className="space-y-3 p-12 text-center">
              <SplitSquareHorizontal className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No split bills yet</p>
              <p className="text-sm text-muted-foreground">
                Create one to divide an expense and track repayments.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {splits.map((split) => {
              const cur = getCurrencySymbol(split.currency);
              const isOwner = split.created_by === user?.id;
              const settledCount = split.participants.filter(
                (p) => p.is_settled,
              ).length;
              const owedTotal = split.participants.reduce(
                (sum, p) => sum + p.share_amount,
                0,
              );
              const collected = split.participants.reduce(
                (sum, p) => sum + (p.is_settled ? p.share_amount : p.amount_paid),
                0,
              );
              const pending = Math.max(0, owedTotal - collected);
              const pct = owedTotal ? (collected / owedTotal) * 100 : 0;
              const allSettled =
                split.participants.length > 0 &&
                settledCount === split.participants.length;

              return (
                <Card key={split.id} className="glass overflow-hidden">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-semibold">
                          {split.title}
                        </h2>
                        {allSettled && (
                          <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Settled
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {split.participants.length + 1} people
                        </span>
                        <span>·</span>
                        <span>
                          {settledCount}/{split.participants.length} settled
                        </span>
                      </p>
                      {split.notes && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {split.notes}
                        </p>
                      )}
                    </div>
                    {isOwner && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => openEdit(split)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground sm:hover:text-destructive"
                          aria-label="Delete split"
                          onClick={() => {
                            if (confirm("Delete this split bill?"))
                              deleteSplit.mutate(split.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Money summary */}
                  <div className="border-y bg-muted/40 px-5 py-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Bill total
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {cur}
                          {formatINR(split.total_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Received
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-emerald-600">
                          {cur}
                          {formatINR(collected)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Pending
                        </p>
                        <p className="mt-0.5 text-sm font-semibold">
                          {cur}
                          {formatINR(pending)}
                        </p>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-3 h-1.5" />
                  </div>

                  <CardContent className="space-y-3 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      People
                    </p>
                    {split.participants.map((p) => {
                      const userEmail = profile?.email?.toLowerCase().trim();
                      const isSelf =
                        p.user_id === user?.id ||
                        (!!userEmail &&
                          p.email?.toLowerCase().trim() === userEmail);
                      const canToggle = isOwner || isSelf;
                      const canPay =
                        paymentsEnabled &&
                        (isSelf || isOwner) &&
                        p.remaining_amount > 0;
                      const label = p.name?.trim() || p.email;
                      const share = p.share_amount || 0;
                      const paidPct = share
                        ? Math.min(
                            100,
                            ((p.is_settled ? share : p.amount_paid) / share) *
                              100,
                          )
                        : 0;
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl border bg-background/60 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="text-xs">
                                {label[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {label}
                                    {isSelf && (
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        (you)
                                      </span>
                                    )}
                                  </p>
                                  {p.name?.trim() && (
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {p.email}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-sm font-semibold">
                                    {cur}
                                    {formatINR(share)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    their share
                                  </p>
                                </div>
                              </div>

                              {!p.is_settled && (
                                <div className="mt-3 space-y-1.5">
                                  <Progress value={paidPct} className="h-1.5" />
                                  <p className="text-[11px] text-muted-foreground">
                                    Paid {cur}
                                    {formatINR(p.amount_paid)} · Remaining{" "}
                                    <span className="font-medium text-foreground">
                                      {cur}
                                      {formatINR(p.remaining_amount)}
                                    </span>
                                  </p>
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  variant={p.is_settled ? "default" : "outline"}
                                  size="sm"
                                  className="h-8"
                                  disabled={!canToggle}
                                  onClick={() =>
                                    toggleSettled.mutate({
                                      participantId: p.id,
                                      isSettled: !p.is_settled,
                                    })
                                  }
                                >
                                  {p.is_settled ? (
                                    <>
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      Settled
                                    </>
                                  ) : (
                                    "Mark settled"
                                  )}
                                </Button>
                                {canPay && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => openPaymentModal(p)}
                                  >
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add payment
                                  </Button>
                                )}
                                {isOwner && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-muted-foreground sm:hover:text-destructive"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "Remove this person and their payments from the split?",
                                        )
                                      )
                                        removeParticipant.mutate({
                                          participantId: p.id,
                                          splitBillId: split.id,
                                        });
                                    }}
                                  >
                                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                                    Remove
                                  </Button>
                                )}
                              </div>


                              {p.payments.length > 0 && (
                                <Collapsible
                                  open={expandedLogs.has(p.id)}
                                  onOpenChange={() => toggleLogs(p.id)}
                                  className="mt-3"
                                >
                                  <CollapsibleTrigger asChild>
                                    <button className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-left">
                                      <span className="text-[11px] font-medium">
                                        Payment activity ({p.payments.length})
                                      </span>
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                                          expandedLogs.has(p.id)
                                            ? "rotate-180"
                                            : ""
                                        }`}
                                      />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="mt-1 divide-y rounded-md border">
                                      {p.payments.map((payment) => (
                                        <div
                                          key={payment.id}
                                          className="flex items-center justify-between gap-3 px-3 py-2"
                                        >
                                          <div className="min-w-0">
                                            {payment.note && (
                                              <p className="truncate text-xs">
                                                {payment.note}
                                              </p>
                                            )}
                                            <p className="text-[11px] text-muted-foreground">
                                              {new Date(
                                                payment.created_at,
                                              ).toLocaleString("en-IN", {
                                                day: "2-digit",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                hour12: true,
                                              })}
                                            </p>
                                          </div>
                                          <div className="flex shrink-0 items-center gap-1">
                                            <span className="text-xs font-medium">
                                              {cur}
                                              {formatINR(payment.amount)}
                                            </span>
                                            {(isSelf || isOwner) && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground sm:hover:text-destructive"
                                                aria-label="Delete payment"
                                                onClick={() =>
                                                  deletePayment.mutate({
                                                    paymentId: payment.id,
                                                    participantId: p.id,
                                                  })
                                                }
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={paymentDialogOpen}
        onOpenChange={(value) => {
          if (!value) setActiveParticipant(null);
          setPaymentDialogOpen(value);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Add payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 py-5">
            {activeParticipant && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activeParticipant.name?.trim() || activeParticipant.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Share {activeSplitCurrency}
                    {formatINR(activeParticipant.share_amount)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {activeSplitCurrency}
                    {formatINR(activeParticipant.remaining_amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">remaining</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount received</Label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              {activeParticipant && activeParticipant.remaining_amount > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    setPaymentAmount(String(activeParticipant.remaining_amount))
                  }
                >
                  Pay full {activeSplitCurrency}
                  {formatINR(activeParticipant.remaining_amount)}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-note">Note (optional)</Label>
              <Textarea
                id="payment-note"
                rows={3}
                className="resize-none"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 border-t px-5 py-4 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePayment}
              loading={createPayment.isPending}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
