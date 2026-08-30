import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBooks } from "@/hooks/useBooks";
import {
  AutomationPreference,
  MoneyTrackerInput,
  MoneyTrackerItem,
  MoneyTrackerType,
  useMoneyTracker,
} from "@/hooks/useMoneyTracker";
import { formatINR } from "@/lib/utils";
import {
  Banknote,
  CalendarClock,
  CreditCard,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const FREQUENCIES = ["monthly", "quarterly", "yearly", "weekly"];
const AUTOMATION: { value: AutomationPreference; label: string }[] = [
  { value: "track_only", label: "Track only" },
  { value: "reminder", label: "Generate reminder" },
  { value: "auto_entry", label: "Automatic Book entry" },
];

const blankForm = (item_type: MoneyTrackerType): MoneyTrackerInput => ({
  item_type,
  name: "",
  amount: 0,
  frequency: "monthly",
  schedule_day: item_type === "investment" ? null : 5,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null,
  active: true,
  automation_preference: "track_only",
  target_book_id: null,
  category_id: null,
  account: "",
  notes: "",
  metadata:
    item_type === "investment"
      ? {
          investmentType: "Mutual Fund",
          alreadyInvestedAmount: 0,
          currentValue: 0,
        }
      : item_type === "emi"
        ? { lender: "", originalLoanAmount: 0, outstandingAmount: 0, interestRate: 0, tenureMonths: 0 }
        : { variableAmount: false },
});

function numberValue(value: unknown) {
  return Number(value) || 0;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Something went wrong";
}

function monthlyAmount(item: MoneyTrackerItem) {
  const amount = numberValue(item.amount);
  if (amount <= 0) return 0;
  if (item.frequency === "yearly") return amount / 12;
  if (item.frequency === "quarterly") return amount / 3;
  if (item.frequency === "weekly") return amount * 4;
  return amount;
}

export default function MoneyTracker() {
  const { books } = useBooks();
  const {
    investments,
    recurringExpenses,
    emis,
    isLoading,
    createItem,
    updateItem,
    deleteItem,
    generateBookEntry,
  } = useMoneyTracker();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MoneyTrackerItem | null>(null);
  const [form, setForm] = useState<MoneyTrackerInput>(blankForm("investment"));

  const overview = useMemo(() => {
    const totalInvested = investments.reduce(
      (sum, item) => sum + numberValue(item.metadata.alreadyInvestedAmount),
      0,
    );
    const currentValue = investments.reduce(
      (sum, item) => sum + numberValue(item.metadata.currentValue),
      0,
    );
    return {
      totalInvested,
      currentValue,
      recurringInvestments: investments.filter((i) => i.active).reduce((s, i) => s + monthlyAmount(i), 0),
      recurringExpenses: recurringExpenses.filter((i) => i.active).reduce((s, i) => s + monthlyAmount(i), 0),
      emis: emis.filter((i) => i.active).reduce((s, i) => s + monthlyAmount(i), 0),
    };
  }, [emis, investments, recurringExpenses]);

  const openCreate = (itemType: MoneyTrackerType) => {
    setEditing(null);
    setForm(blankForm(itemType));
    setOpen(true);
  };

  const openEdit = (item: MoneyTrackerItem) => {
    setEditing(item);
    setForm({ ...item, metadata: item.metadata ?? {} });
    setOpen(true);
  };

  const saveItem = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        amount: numberValue(form.amount),
        schedule_day: form.schedule_day || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        account: form.account?.trim() || null,
        notes: form.notes?.trim() || null,
        target_book_id:
          form.automation_preference === "auto_entry"
            ? form.target_book_id || null
            : null,
        category_id: form.category_id || null,
      };
      if (editing) await updateItem.mutateAsync({ itemId: editing.id, ...payload });
      else await createItem.mutateAsync(payload);
      toast.success(editing ? "Money Tracker item updated" : "Money Tracker item created");
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renderItems = (items: MoneyTrackerItem[], itemType: MoneyTrackerType) => (
    <div className="space-y-3">
      <Button onClick={() => openCreate(itemType)} className="gap-2">
        <Plus className="h-4 w-4" />
        Add {itemType === "emi" ? "EMI" : itemType === "investment" ? "Investment" : "Recurring Expense"}
      </Button>
      {items.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No items yet.
          </CardContent>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.id} className="glass cursor-pointer sm:hover:shadow-md" onClick={() => openEdit(item)}>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{item.name}</p>
                  {!item.active && <span className="text-xs text-muted-foreground">Inactive</span>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.item_type === "investment" && numberValue(item.amount) <= 0
                    ? "One-time / existing investment"
                    : `₹${formatINR(numberValue(item.amount))} / ${item.frequency}`}
                  {item.schedule_day ? ` • due ${item.schedule_day}` : ""}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.account || "No account"} • {AUTOMATION.find((a) => a.value === item.automation_preference)?.label}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.automation_preference === "auto_entry" &&
                  item.target_book_id &&
                  numberValue(item.amount) > 0 &&
                  item.last_processed_date !== todayKey() && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async (event) => {
                        event.stopPropagation();
                        try {
                          await generateBookEntry.mutateAsync(item);
                          toast.success("Book entry created");
                        } catch (error: any) {
                          if (error?.isDuplicateSource) {
                            toast("An entry for this occurrence already exists");
                            return;
                          }
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      Create Entry
                    </Button>
                  )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground sm:hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteItem.mutate(item.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  const setMetadata = (key: string, value: unknown) =>
    setForm((current) => ({
      ...current,
      metadata: { ...current.metadata, [key]: value },
    }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Money Tracker</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Investments, recurring expenses, and EMI commitments
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="emis">EMIs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["Total Invested", overview.totalInvested, PiggyBank],
                ["Current Value", overview.currentValue, Landmark],
                ["Monthly Commitments", overview.recurringExpenses + overview.emis + overview.recurringInvestments, CalendarClock],
                ["EMIs", overview.emis, CreditCard],
              ].map(([label, value, Icon]) => (
                <Card key={label as string} className="glass">
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{label as string}</p>
                      <p className="font-display font-bold text-xl">₹{formatINR(value as number)}</p>
                    </div>
                    <Icon className="h-5 w-5 text-primary" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="font-display text-lg">Monthly Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <p>Recurring Expenses: ₹{formatINR(overview.recurringExpenses)}</p>
                <p>EMIs: ₹{formatINR(overview.emis)}</p>
                <p>Recurring Investments: ₹{formatINR(overview.recurringInvestments)}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="investments">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : renderItems(investments, "investment")}
          </TabsContent>
          <TabsContent value="recurring">
            {renderItems(recurringExpenses, "recurring_expense")}
          </TabsContent>
          <TabsContent value="emis">{renderItems(emis, "emi")}</TabsContent>
        </Tabs>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent fullscreen className="flex flex-col">
            <DialogHeader className="pb-6 sticky top-0 bg-background/95 backdrop-blur-sm pt-4 px-4 sm:px-6 z-40 border-b">
              <DialogTitle>{editing ? "Edit" : "Add"} Money Tracker Item</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>
                    {form.item_type === "investment"
                      ? "Recurring Investment Amount"
                      : form.item_type === "emi"
                        ? "EMI Amount"
                        : "Amount"}
                  </Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
                {(form.item_type !== "investment" || numberValue(form.amount) > 0) && (
                  <>
                    <div className="space-y-2">
                  <Label>Frequency</Label>
                      <Select value={form.frequency} onValueChange={(frequency) => setForm({ ...form, frequency })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {form.item_type === "investment" ? "Deduction Date" : "Due Date"}{" "}
                        (optional)
                      </Label>
                      <Input type="number" min={1} max={31} value={form.schedule_day ?? ""} onChange={(e) => setForm({ ...form, schedule_day: Number(e.target.value) || null })} />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Start Date (optional)</Label>
                  <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
                </div>
                <div className="space-y-2">
                  <Label>End Date (optional)</Label>
                  <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} />
                </div>
                <div className="space-y-2">
                  <Label>Account / Platform (optional)</Label>
                  <Input value={form.account ?? ""} onChange={(e) => setForm({ ...form, account: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Automation</Label>
                  <Select value={form.automation_preference} onValueChange={(value: AutomationPreference) => setForm({ ...form, automation_preference: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AUTOMATION.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.automation_preference === "auto_entry" && (
                  <div className="space-y-2">
                    <Label>Target Book</Label>
                    <Select value={form.target_book_id ?? ""} onValueChange={(value) => setForm({ ...form, target_book_id: value })}>
                      <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                      <SelectContent>{books.map((book) => <SelectItem key={book.id} value={book.id}>{book.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {form.item_type === "investment" && (
                  <>
                    <div className="space-y-2">
                      <Label>Already Invested (optional)</Label>
                      <Input type="number" value={numberValue(form.metadata.alreadyInvestedAmount)} onChange={(e) => setMetadata("alreadyInvestedAmount", Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Current Value (optional)</Label>
                      <Input type="number" value={numberValue(form.metadata.currentValue)} onChange={(e) => setMetadata("currentValue", Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Investment Type (optional)</Label>
                      <Input value={String(form.metadata.investmentType ?? "")} onChange={(e) => setMetadata("investmentType", e.target.value)} />
                    </div>
                  </>
                )}
                {form.item_type === "emi" && (
                  <>
                    <div className="space-y-2">
                      <Label>Lender (optional)</Label>
                      <Input value={String(form.metadata.lender ?? "")} onChange={(e) => setMetadata("lender", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Outstanding Amount (optional)</Label>
                      <Input type="number" value={numberValue(form.metadata.outstandingAmount)} onChange={(e) => setMetadata("outstandingAmount", Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Interest Rate (optional)</Label>
                      <Input type="number" value={numberValue(form.metadata.interestRate)} onChange={(e) => setMetadata("interestRate", Number(e.target.value))} />
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <Label>Active</Label>
                <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveItem} disabled={createItem.isPending || updateItem.isPending}>
                {(createItem.isPending || updateItem.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
