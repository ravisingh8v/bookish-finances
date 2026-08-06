import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBooks } from "@/hooks/useBooks";
import { Debt, useDebts } from "@/hooks/useDebts";
import { CreditCard } from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const pretty = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const canRecordPayment = (debt: Debt) =>
  debt.remaining_amount > 0 &&
  !["pending", "rejected", "cancelled"].includes(debt.status);

export function RecordDebtPayment({
  debt,
  trigger,
}: {
  debt: Debt;
  trigger?: React.ReactNode;
}) {
  const { recordPayment } = useDebts();
  const { books } = useBooks();
  const activeBooks = (books ?? []).filter((b) => !b.archived);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [bookId, setBookId] = useState("none");
  const [expenseType, setExpenseType] = useState<"credit" | "debit">("debit");

  const reset = () => {
    setAmount("");
    setMethod("upi");
    setReference("");
    setNotes("");
    setBookId("none");
  };

  const save = async () => {
    await recordPayment({
      id: debt.id,
      amount: Number(amount),
      method,
      reference,
      notes,
      bookId: bookId === "none" ? undefined : bookId,
      expenseType,
    });
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          reset();
          setExpenseType(debt.view_direction === "receivable" ? "credit" : "debit");
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <CreditCard className="mr-2 h-4 w-4" />
            Record payment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setAmount(String(debt.remaining_amount))}
              >
                Settle full {money(debt.remaining_amount)}
              </Button>
            </div>
            <Input
              type="number"
              autoFocus
              max={debt.remaining_amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["upi", "cash", "bank_transfer", "card", "cheque", "other"].map(
                  (x) => (
                    <SelectItem key={x} value={x}>
                      {pretty(x)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference number</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              placeholder="Used as the entry title when reflected in a book"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reflect in book (optional)</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Don't reflect" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Don't reflect</SelectItem>
                {activeBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {bookId !== "none" && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={expenseType === "debit" ? "default" : "outline"}
                onClick={() => setExpenseType("debit")}
              >
                Debit
              </Button>
              <Button
                type="button"
                variant={expenseType === "credit" ? "default" : "outline"}
                onClick={() => setExpenseType("credit")}
              >
                Credit
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={
              !Number(amount) || Number(amount) > debt.remaining_amount
            }
          >
            Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
