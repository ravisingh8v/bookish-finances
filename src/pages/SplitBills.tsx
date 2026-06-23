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
import { useAuth } from "@/hooks/useAuth";
import { useSplitBills } from "@/hooks/useSplitBills";
import { formatINR } from "@/lib/utils";
import {
  Check,
  Loader2,
  Mail,
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
  const { user } = useAuth();
  const { splits, isLoading, createSplit, deleteSplit, toggleSettled } =
    useSplitBills();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCurrency("INR");
    setNotes("");
    setEmailInput("");
    setEmails([]);
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
    setEmailInput("");
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
      await createSplit.mutateAsync({
        title: title.trim(),
        total_amount: Number(amount),
        currency,
        emails,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      resetForm();
    } catch {}
  };

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
                <DialogTitle>New Split Bill</DialogTitle>
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
                  <Label htmlFor="split-email">Split with (email)</Label>
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
                  {emails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {emails.map((e) => (
                        <span
                          key={e}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-1"
                        >
                          {e}
                          <button
                            type="button"
                            onClick={() =>
                              setEmails((prev) => prev.filter((x) => x !== e))
                            }
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
                  disabled={createSplit.isPending}
                >
                  {createSplit.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Create Split
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0"
                          onClick={() => {
                            if (confirm("Delete this split bill?"))
                              deleteSplit.mutate(split.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {split.notes && (
                      <p className="text-xs text-muted-foreground">
                        {split.notes}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {split.participants.map((p) => {
                        const canToggle = isOwner || p.user_id === user?.id;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2"
                          >
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate flex-1">
                              {p.email}
                            </span>
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
    </DashboardLayout>
  );
}
