import { DashboardLayout } from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBooks } from "@/hooks/useBooks";
import { useExpenses } from "@/hooks/useExpenses";
import { ChecklistItem, ChecklistSourceExpense, useRecurringExpenseChecklist } from "@/hooks/useRecurringExpenseChecklist";
import { formatINR } from "@/lib/utils";
import { ArrowLeft, ArrowRight, CircleDollarSign, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
const monthLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

function ChecklistEditor({
  item,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  item: ChecklistItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: { id?: string; title: string; amount: number | null; notes: string | null }) => Promise<unknown>;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [amount, setAmount] = useState(item?.amount == null ? "" : String(item.amount));
  const [notes, setNotes] = useState(item?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setAmount(item?.amount == null ? "" : String(item.amount));
    setNotes(item?.notes ?? "");
  }, [item, open]);

  const start = () => {
    setTitle(item?.title ?? "");
    setAmount(item?.amount == null ? "" : String(item.amount));
    setNotes(item?.notes ?? "");
  };

  const save = async () => {
    if (!title.trim()) return;
    try {
      await onSave({
        id: item?.id,
        title: title.trim(),
        amount: amount.trim() ? Number(amount) || 0 : null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // The mutation reports the actionable error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (next) start(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit recurring expense" : "Add recurring expense"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="checklist-title">Expense name</Label>
            <Input id="checklist-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Rent" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checklist-amount">Usual amount (optional)</Label>
            <Input id="checklist-amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checklist-notes">Notes (optional)</Label>
            <Textarea id="checklist-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a reminder or details" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim() || isSaving} onClick={save}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {item ? "Save changes" : "Add to list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportExpensesDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (expenses: ChecklistSourceExpense[]) => Promise<unknown>;
  isImporting: boolean;
}) {
  const { allBooks } = useBooks();
  const [bookId, setBookId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { expenses, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useExpenses(bookId);
  const selectedExpenses = useMemo(() => expenses.filter((expense) => selectedIds.has(expense.id)), [expenses, selectedIds]);

  const importSelected = async () => {
    try {
      await onImport(selectedExpenses.map((expense) => ({
        id: expense.id,
        title: expense.title,
        amount: Number(expense.amount) || 0,
        notes: expense.notes,
      })));
      toast.success(`${selectedExpenses.length} ${selectedExpenses.length === 1 ? "expense added" : "expenses added"} to your checklist`);
      setSelectedIds(new Set());
      onOpenChange(false);
    } catch {
      // The mutation reports the actionable error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setSelectedIds(new Set()); setBookId(""); } }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Copy expenses from a Book</DialogTitle>
          <p className="text-sm text-muted-foreground">Selected entries become reusable checklist items; no Book transactions are created.</p>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="source-book">Choose a Book</Label>
          <Select value={bookId} onValueChange={(value) => { setBookId(value); setSelectedIds(new Set()); }}>
            <SelectTrigger id="source-book"><SelectValue placeholder="Select a Book" /></SelectTrigger>
            <SelectContent>
              {allBooks.map((book) => <SelectItem value={book.id} key={book.id}>{book.name}{book.archived ? " · Archived" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2">
          {!bookId ? <p className="py-8 text-center text-sm text-muted-foreground">Choose a Book to browse its expenses.</p> : null}
          {bookId && isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : null}
          {bookId && !isLoading && expenses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No expenses in this Book yet.</p> : null}
          {expenses.map((expense) => (
            <label key={expense.id} className="flex cursor-pointer items-center gap-3 border-b py-3 last:border-0">
              <Checkbox checked={selectedIds.has(expense.id)} onCheckedChange={(checked) => {
                setSelectedIds((old) => {
                  const next = new Set(old);
                  if (checked) next.add(expense.id); else next.delete(expense.id);
                  return next;
                });
              }} />
              <span className="min-w-0 flex-1">
                <span className="block break-words [overflow-wrap:anywhere] text-sm font-medium">{expense.title}</span>
                <span className="block text-xs text-muted-foreground">{new Date(expense.date).toLocaleDateString("en-IN")}</span>
              </span>
              <span className="shrink-0 text-sm font-medium">{formatINR(Number(expense.amount) || 0)}</span>
            </label>
          ))}
          {hasNextPage && <Button variant="ghost" className="w-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load more expenses"}</Button>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={selectedIds.size === 0 || isImporting} onClick={importSelected}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add selected ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecurringChecklist() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const { items, completedIds, isLoading, isOnline, saveItem, deleteItem, setCompleted, importExpenses, resetMonth, isSaving, isUpdating } = useRecurringExpenseChecklist(month);
  const completedCount = items.filter((item) => completedIds.has(item.id)).length;
  const remainingCount = items.length - completedCount;
  const progress = items.length ? (completedCount / items.length) * 100 : 0;

  const shiftMonth = (delta: number) => {
    const [year, monthNumber] = month.split("-").map(Number);
    setMonth(monthKey(new Date(year, monthNumber - 1 + delta, 1)));
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">Recurring Checklist</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">A reusable list for regular expenses. Mark payments as you make them, then reset the month without rebuilding your list.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="gap-2" disabled={!isOnline} onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add expense</span></Button>
            <Button variant="secondary" className="gap-2" disabled={!isOnline} onClick={() => setImportOpen(true)}>Copy from Book</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ArrowLeft className="h-4 w-4" /></Button>
            <h2 className="min-w-36 text-center text-lg font-semibold">{monthLabel(month)}</h2>
            <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}><ArrowRight className="h-4 w-4" /></Button>
            {month !== monthKey(new Date()) && <Button variant="link" size="sm" onClick={() => setMonth(monthKey(new Date()))}>This month</Button>}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={remainingCount === 0 && items.length > 0 ? "default" : "secondary"}>{completedCount} / {items.length} paid</Badge>
            {items.length > 0 && remainingCount === 0 && <Button variant="ghost" size="sm" disabled={isUpdating} onClick={() => setResetOpen(true)}><RotateCcw className="mr-1.5 h-4 w-4" />Reset month</Button>}
          </div>
        </div>

        {items.length > 0 && <Progress value={progress} className="h-1.5" />}

        {!isOnline && <p className="text-sm text-destructive">Connect to the internet to manage this checklist.</p>}
        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : items.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <CircleDollarSign className="h-10 w-10 text-muted-foreground" />
            <div><h2 className="font-semibold">Your reusable list starts here</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Add regular expenses yourself or copy entries from any Book. Mark each one paid every month.</p></div>
            <Button disabled={!isOnline} onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add first expense</Button>
          </CardContent></Card>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const complete = completedIds.has(item.id);
              return <div key={item.id} className="flex items-start gap-3 py-4 sm:items-center">
                <Checkbox aria-label={`Mark ${item.title} ${complete ? "unpaid" : "paid"}`} checked={complete} disabled={!isOnline || isUpdating} onCheckedChange={(checked) => setCompleted({ itemId: item.id, completed: Boolean(checked) })} className="mt-1 sm:mt-0" />
                <div className="min-w-0 flex-1">
                  <p className={`break-words [overflow-wrap:anywhere] font-medium ${complete ? "text-muted-foreground line-through" : ""}`}>{item.title}</p>
                  {item.notes && <p className="mt-0.5 break-words [overflow-wrap:anywhere] text-sm text-muted-foreground">{item.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.amount != null && <span className={`text-sm font-semibold ${complete ? "text-muted-foreground" : ""}`}>{formatINR(Number(item.amount) || 0)}</span>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${item.title}`} disabled={!isOnline} onClick={() => { setEditing(item); setEditorOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground sm:hover:text-destructive" aria-label={`Delete ${item.title}`} disabled={!isOnline} onClick={() => {
                    if (window.confirm(`Remove “${item.title}” from your reusable list?`)) void deleteItem(item.id);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>;
            })}
          </div>
        )}
      </div>

      <ChecklistEditor item={editing} open={editorOpen} onOpenChange={setEditorOpen} onSave={saveItem} isSaving={isSaving} />
      <ImportExpensesDialog open={importOpen} onOpenChange={setImportOpen} onImport={importExpenses} isImporting={isSaving} />
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {monthLabel(month)}?</AlertDialogTitle>
            <AlertDialogDescription>All expenses will return to pending for this month. Your reusable checklist and other months will stay unchanged.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep paid marks</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void resetMonth().then(() => { setResetOpen(false); toast.success("Checklist reset for this month"); }).catch(() => undefined); }}>Reset month</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}