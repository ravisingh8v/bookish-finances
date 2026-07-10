import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDebts } from "@/hooks/useDebts";
import { useBooks } from "@/hooks/useBooks";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CreditCard,
  UserRound,
} from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const pretty = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const formatDebtDate = (value?: string | null, withTime = false) => {
  if (!value) return "";
  const hasTime = value.includes("T");
  const date = hasTime
    ? new Date(value)
    : (() => { const [y,m,d] = value.slice(0,10).split("-").map(Number); return new Date(y,m-1,d); })();
  return date.toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};
export default function DebtDetail() {
  const { debtId } = useParams();
  const { debts, isLoading, recordPayment } = useDebts();
  const { books } = useBooks();
  const activeBooks = (books ?? []).filter((b) => !b.archived);
  const debt = debts.find((d) => d.id === debtId);
  const [open, setOpen] = useState(false),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("upi"),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [bookId, setBookId] = useState("none"),
    [expenseType, setExpenseType] = useState<"credit" | "debit">("debit");
  if (isLoading)
    return (
      <DashboardLayout>
        <p>Loading…</p>
      </DashboardLayout>
    );
  if (!debt)
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="p-8 text-center">
            <p>Debt not found or you do not have access.</p>
            <Button asChild className="mt-4">
              <Link to="/debts">Back to debts</Link>
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  const pct = debt.total_amount
    ? (debt.paid_amount / debt.total_amount) * 100
    : 0;
  const timeline = [
    ...(debt.activities || []).map((a) => ({
      id: a.id,
      title: pretty(a.event_type),
      date: a.created_at,
    })),
    ...(debt.payments || []).map((p) => ({
      id: p.id,
      title: `${money(p.amount)} paid`,
      date: p.created_at,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/debts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Debts
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{debt.description}</h1>
              <Badge>{pretty(debt.status)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {pretty(debt.debt_type)} · created{" "}
              {formatDebtDate(debt.created_at, true)}
            </p>
          </div>
          {debt.remaining_amount > 0 &&
            !["pending", "rejected", "cancelled"].includes(debt.status) && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Record payment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record payment</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
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
                          {[
                            "upi",
                            "cash",
                            "bank_transfer",
                            "card",
                            "cheque",
                            "other",
                          ].map((x) => (
                            <SelectItem key={x} value={x}>
                              {pretty(x)}
                            </SelectItem>
                          ))}
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
                      onClick={async () => {
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
                        setAmount("");
                        setNotes("");
                        setReference("");
                        setBookId("none");
                      }}
                      disabled={
                        !Number(amount) ||
                        Number(amount) > debt.remaining_amount
                      }
                    >
                      Save payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{money(debt.total_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-lg font-bold text-emerald-600">
                  {money(debt.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-lg font-bold">
                  {money(debt.remaining_amount)}
                </p>
              </div>
            </div>
            <Progress value={pct} className="mt-4" />
          </CardContent>
        </Card>
        <Tabs defaultValue="overview">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="installments">Installments</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardContent className="space-y-5 p-4">
                <div>
                  <h2 className="font-semibold">Participants</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      ["Lender", debt.lender],
                      ["Borrower", debt.borrower],
                    ].map(([role, p]: any) => (
                      <div
                        className="flex items-center gap-3 rounded-lg bg-muted p-3"
                        key={role}
                      >
                        <UserRound className="h-5 w-5" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {role}
                          </p>
                          <p className="font-medium">
                            {p?.display_name ||
                              p?.email ||
                              (((role === "Lender" && debt.direction === "payable") ||
                                (role === "Borrower" && debt.direction === "receivable"))
                                ? debt.counterparty_alias
                                : "Not linked")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p?.email ||
                              (((role === "Lender" && debt.direction === "payable") ||
                                (role === "Borrower" && debt.direction === "receivable"))
                                ? debt.counterparty_email
                                : "")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {debt.notes && (
                  <div>
                    <h2 className="font-semibold">Notes</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {debt.notes}
                    </p>
                  </div>
                )}
                {debt.loan_details && (
                  <div>
                    <h2 className="font-semibold">Loan details</h2>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(debt.loan_details)
                        .filter(
                          ([, v]) =>
                            v !== null && v !== "" && typeof v !== "boolean",
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs text-muted-foreground">
                              {pretty(k)}
                            </p>
                            <p className="font-medium">
                              {typeof v === "number" && k.includes("amount")
                                ? money(v)
                                : String(v)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="installments">
            <Card>
              <CardContent className="divide-y p-4">
                {debt.installments.length ? (
                  debt.installments.map((i) => (
                    <div
                      className="flex items-center justify-between py-3"
                      key={i.id}
                    >
                      <div>
                        <p className="font-medium">
                          Installment {i.installment_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDebtDate(i.due_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{money(i.amount)}</p>
                        <Badge variant="outline">{pretty(i.status)}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No installment schedule.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments">
            <Card>
              <CardContent className="divide-y p-4">
                {debt.payments.length ? (
                  debt.payments.map((p) => (
                    <div className="py-3" key={p.id}>
                      <div className="flex justify-between">
                        <p className="font-semibold text-emerald-600">
                          {money(p.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDebtDate(p.payment_date)}
                        </p>
                      </div>
                      <p className="text-sm">
                        {pretty(p.payment_method)}{" "}
                        {p.reference_number && `· ${p.reference_number}`}
                      </p>
                      {p.notes && (
                        <p className="text-xs text-muted-foreground">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No payments recorded.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity">
            <Card>
              <CardContent className="p-4">
                {timeline.map((e, n) => (
                  <div className="flex gap-3 pb-5 last:pb-0" key={e.id}>
                    <div className="flex flex-col items-center">
                      {n === timeline.length - 1 ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                      {n < timeline.length - 1 && (
                        <span className="h-full w-px bg-border" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                          {formatDebtDate(e.date, true)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
