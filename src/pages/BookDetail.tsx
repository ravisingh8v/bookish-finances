import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useExpenses, useCategories } from "@/hooks/useExpenses";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, TrendingDown, TrendingUp, ArrowUpDown, Loader2, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "wallet", "other"];
const EXPENSE_TYPES = [
  { value: "debit", label: "Expense", icon: TrendingDown, color: "text-destructive" },
  { value: "credit", label: "Income", icon: TrendingUp, color: "text-success" },
];

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const { expenses, isLoading, createExpense, deleteExpense } = useExpenses(bookId!);
  const { data: categories } = useCategories();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [expenseType, setExpenseType] = useState("debit");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_books").select("*").eq("id", bookId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
  });

  const book = bookQuery.data;

  const resetForm = () => {
    setTitle(""); setAmount(""); setDate(new Date().toISOString().split("T")[0]);
    setCategoryId(""); setExpenseType("debit"); setPaymentMethod("cash"); setNotes("");
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { toast.error("Valid amount is required"); return; }
    try {
      await createExpense.mutateAsync({
        title: title.trim(), amount: Number(amount), date,
        category_id: categoryId || undefined, expense_type: expenseType,
        payment_method: paymentMethod, notes: notes.trim() || undefined,
      });
      toast.success("Expense added!");
      setOpen(false);
      resetForm();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = expenses.filter(e => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && e.expense_type !== filterType) return false;
    return true;
  });

  const totalIncome = expenses.filter(e => e.expense_type === "credit").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = expenses.filter(e => e.expense_type === "debit").reduce((s, e) => s + Number(e.amount), 0);

  const getCurrencySymbol = (c: string) => ({ INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥" }[c] ?? c + " ");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/books"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold truncate">{book?.name ?? "Loading..."}</h1>
            {book?.description && <p className="text-muted-foreground text-sm truncate">{book.description}</p>}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {EXPENSE_TYPES.map(t => (
                    <button key={t.value} onClick={() => setExpenseType(t.value)}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2
                        ${expenseType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                      <t.icon className="h-4 w-4" />{t.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-2"><Label>Title</Label><Input placeholder="What did you spend on?" value={title} onChange={e => setTitle(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Amount</Label><Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Notes (optional)</Label><Textarea placeholder="Any additional details..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
                <Button className="w-full" onClick={handleCreate} disabled={createExpense.isPending}>
                  {createExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add {expenseType === "credit" ? "Income" : "Expense"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="glass"><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Income</p>
            <p className="text-xl font-display font-bold text-success">{getCurrencySymbol(book?.currency ?? "INR")}{totalIncome.toLocaleString()}</p>
          </CardContent></Card>
          <Card className="glass"><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Expenses</p>
            <p className="text-xl font-display font-bold text-destructive">{getCurrencySymbol(book?.currency ?? "INR")}{totalExpense.toLocaleString()}</p>
          </CardContent></Card>
          <Card className="glass"><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-xl font-display font-bold">{getCurrencySymbol(book?.currency ?? "INR")}{(totalIncome - totalExpense).toLocaleString()}</p>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search expenses..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="debit">Expenses</SelectItem>
              <SelectItem value="credit">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Expense List */}
        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <Card className="glass"><CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{expenses.length === 0 ? "No expenses yet. Add your first one!" : "No matching expenses found."}</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((expense, i) => (
              <motion.div key={expense.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="glass hover:shadow-md transition-shadow group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (expense.categories?.color ?? "#6B7280") + "20", color: expense.categories?.color ?? "#6B7280" }}>
                      {expense.expense_type === "credit" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{expense.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{expense.categories?.name ?? "Uncategorized"}</span>
                        <span>•</span>
                        <span>{new Date(expense.date).toLocaleDateString()}</span>
                        {expense.payment_method && <><span>•</span><span className="capitalize">{expense.payment_method}</span></>}
                      </div>
                    </div>
                    <p className={`font-display font-bold text-lg shrink-0 ${expense.expense_type === "credit" ? "text-success" : "text-destructive"}`}>
                      {expense.expense_type === "credit" ? "+" : "-"}{getCurrencySymbol(book?.currency ?? "INR")}{Number(expense.amount).toLocaleString()}
                    </p>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (confirm("Delete this expense?")) deleteExpense.mutate(expense.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
