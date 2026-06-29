import { DashboardLayout } from "@/components/DashboardLayout";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { useSplitBills, type SplitParticipant } from "@/hooks/useSplitBills";
import { formatINR } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  Loader2,
  Mail,
  Pencil,
  Plus,
  SplitSquareHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY"];
const getCurrencySymbol = (c: string) =>
  ({ INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥" })[c] ?? c + " ";

export default function SplitBills() {
  const { user, profile } = useAuth();
  const {
    splits,
    isLoading,
    createSplit,
    editSplit,
    deleteSplit,
    deletePayment,
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
  const [activeParticipant, setActiveParticipant] = useState<SplitParticipant | null>(null);
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
          split.participants.some((participant) => participant.id === activeParticipant.id),
        )?.currency ?? "INR",
      )
    : "";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-display font-bold sm:text-2xl">
              Split Bills
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Divide an expense and share it via email
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
              <Button className="gap-2 h-9 px-3 sm:px-4">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Split</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Split Bill" : "New Split Bill"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="split-title">Title</Label>
                  <Input
                    id="split-title"
                    placeholder="Dinner, trip, rent..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="split-amount">Total Amount</Label>
                    <Input
                      id="split-amount"
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
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
                <div className="space-y-1.5">
                  <Label htmlFor="split-email">Split with</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
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
                    <div className="flex gap-2">
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
                      <Button type="button" variant="outline" onClick={addEmail}>
                        Add
                      </Button>
                    </div>
                  </div>
                  {emails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {emails.map((e) => (
                        <span
                          key={e}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-1"
                        >
                          {names[e] ? `${names[e]} (${e})` : e}
                          <button
                            type="button"
                            onClick={() => {
                              setEmails((prev) => prev.filter((x) => x !== e));
                              setNames((prev) => {
                                const next = { ...prev };
                                delete next[e];
                                return next;
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {perHead > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Splitting {getCurrencySymbol(currency)}
                    {formatINR(Number(amount))} between {headCount} people ={" "}
                    <span className="font-semibold text-foreground">
                      {getCurrencySymbol(currency)}
                      {formatINR(perHead)}
                    </span>{" "}
                    each
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="split-notes">Notes (optional)</Label>
                  <Textarea
                    id="split-notes"
                    rows={2}
                    className="resize-none"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={createSplit.isPending || editSplit.isPending}
                >
                  {(createSplit.isPending || editSplit.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {editingId ? "Save Changes" : "Create Split"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!paymentsEnabled && (
          <Card className="glass border-warning/40 bg-warning/10">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-warning">Split payment activity unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">
                Partial payment tracking is disabled because the required database schema is not available yet. Apply the latest migration and refresh the page to enable payments.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : splits.length === 0 ? (
          <Card className="glass">
            <CardContent className="p-10 text-center space-y-3">
              <SplitSquareHorizontal className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">
                No split bills yet. Create one to divide an expense with others.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {splits.map((split) => {
              const cur = getCurrencySymbol(split.currency);
              const isOwner = split.created_by === user?.id;
              const settledCount = split.participants.filter(
                (p) => p.is_settled,
              ).length;
              return (
                <Card key={split.id} className="glass">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{split.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {cur}
                          {formatINR(split.total_amount)} •{" "}
                          {split.participants.length + 1} people •{" "}
                          {settledCount}/{split.participants.length} settled
                        </p>
                      </div>
                      {isOwner && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground sm:hover:text-foreground"
                            onClick={() => openEdit(split)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
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

                    {split.notes && (
                      <p className="text-xs text-muted-foreground">
                        {split.notes}
                      </p>
                    )}

                    <div className="space-y-2">
                      {split.participants.map((p) => {
                        const userEmail = profile?.email?.toLowerCase().trim();
                        const isSelf =
                          p.user_id === user?.id ||
                          (!!userEmail && p.email?.toLowerCase().trim() === userEmail);
                        const canToggle = isOwner || isSelf;
                        const canPay =
                          paymentsEnabled && (isSelf || isOwner) && p.remaining_amount > 0;
                        return (
                          <div key={p.id} className="space-y-2">
                            <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm truncate">{p.name?.trim() || p.email}</p>
                                  {p.name?.trim() && (
                                    <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                                  )}
                                  {!p.is_settled && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Paid {cur}{formatINR(p.amount_paid)} • Remaining {cur}{formatINR(p.remaining_amount)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-sm font-medium shrink-0">
                                  {cur}
                                  {formatINR(p.share_amount)}
                                </span>
                                <Button
                                  variant={p.is_settled ? "default" : "outline"}
                                  size="sm"
                                  className="h-7 px-2 shrink-0"
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
                                      <Check className="h-3 w-3 mr-1" />
                                      Paid
                                    </>
                                  ) : (
                                    "Mark Paid"
                                  )}
                                </Button>
                                {canPay && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 shrink-0"
                                    onClick={() => openPaymentModal(p)}
                                  >
                                    Add Payment
                                  </Button>
                                )}
                              </div>
                            </div>
                            {p.payments.length > 0 && (
                              <Collapsible open={expandedLogs.has(p.id)} onOpenChange={() => toggleLogs(p.id)}>
                                <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                                  <CollapsibleTrigger asChild>
                                    <button className="w-full flex items-center justify-between gap-2">
                                      <span className="font-medium text-[11px] text-foreground">
                                        Payment Activity ({p.payments.length})
                                      </span>
                                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expandedLogs.has(p.id) ? "rotate-180" : ""}`} />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="space-y-1 mt-1">
                                      {p.payments.map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between gap-2">
                                          <div className="min-w-0 truncate">
                                            {payment.note ? `${payment.note} — ` : ""}
                                            {new Date(payment.created_at).toLocaleString("en-IN", {
                                              day: "2-digit",
                                              month: "short",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                              hour12: true,
                                            })}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <span className="font-medium">
                                              {cur}{formatINR(payment.amount)}
                                            </span>
                                            {(isSelf || isOwner) && (
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-destructive"
                                                onClick={() =>
                                                  deletePayment.mutate({
                                                    paymentId: payment.id,
                                                    participantId: p.id,
                                                  })
                                                }
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Participant</Label>
              <Input readOnly value={activeParticipant?.name?.trim() || activeParticipant?.email || ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              {activeParticipant && (
                <p className="text-xs text-muted-foreground">
                  Remaining {activeSplitCurrency}{formatINR(activeParticipant.remaining_amount)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
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
          <DialogFooter>
            <Button
              className="w-full"
              onClick={handleCreatePayment}
              disabled={createPayment.isPending}
            >
              {createPayment.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
