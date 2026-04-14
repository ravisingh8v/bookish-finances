import { BookMembers } from "@/components/BookMembers";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useBookMembers } from "@/hooks/useBookMembers";
import { useCategories, useExpenses } from "@/hooks/useExpenses";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Edit,
  EllipsisVertical,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

const PAYMENT_METHODS = [
  "cash",
  "card",
  "upi",
  "bank_transfer",
  "wallet",
  "other",
];
const EXPENSE_TYPES = [
  {
    value: "debit",
    label: "Expense",
    icon: TrendingDown,
    color: "text-destructive",
  },
  { value: "credit", label: "Income", icon: TrendingUp, color: "text-success" },
];

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const getCurrencySymbol = (c: string) =>
  ({ INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥" })[c] ?? c + " ";

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const { user } = useAuth();
  const { expenses, isLoading, createExpense, deleteExpense } = useExpenses(
    bookId!,
  );
  const { data: categories } = useCategories();
  const { members, isOwner, currentUserRole } = useBookMembers(bookId!);
  const [open, setOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterMember, setFilterMember] = useState<string>("all");

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
      const { data, error } = await supabase
        .from("expense_books")
        .select("*")
        .eq("id", bookId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
  });

  const book = bookQuery.data;
  const canEdit = currentUserRole === "owner" || currentUserRole === "editor";

  // Access denied state
  if (bookQuery.error || (bookQuery.isSuccess && !book)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-display font-bold">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have access to this book or it doesn't exist.
          </p>
          <Link to="/books">
            <Button variant="outline">Back to Books</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setCategoryId("");
    setExpenseType("debit");
    setPaymentMethod("cash");
    setNotes("");
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Valid amount is required");
      return;
    }
    try {
      await createExpense.mutateAsync({
        title: title.trim(),
        amount: Number(amount),
        date,
        category_id: categoryId || undefined,
        expense_type: expenseType,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      });
      toast.success("Expense added!");
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = expenses.filter((e) => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (filterType !== "all" && e.expense_type !== filterType) return false;
    if (filterMember !== "all" && e.created_by !== filterMember) return false;
    return true;
  });

  const totalIncome = expenses
    .filter((e) => e.expense_type === "credit")
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = expenses
    .filter((e) => e.expense_type === "debit")
    .reduce((s, e) => s + Number(e.amount), 0);
  const cur = getCurrencySymbol(book?.currency ?? "INR");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/books">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-display font-bold truncate">
              {book?.name ?? "Loading..."}
            </h1>
            {book?.description && (
              <p className="text-muted-foreground text-xs sm:text-sm truncate">
                {book.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setShowMembers(!showMembers)}
            >
              <Users className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" className="h-9 w-9 sm:h-auto sm:w-auto sm:px-4 sm:gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
                  <DialogHeader>
                    <DialogTitle>Add Expense</DialogTitle>
                  </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setExpenseType(t.value)}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2
                          ${expenseType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}
                      >
                        <t.icon className="h-4 w-4" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="What did you spend on?"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment</Label>
                      <Select
                        value={paymentMethod}
                        onValueChange={setPaymentMethod}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m
                                .replace("_", " ")
                                .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      placeholder="Any additional details..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createExpense.isPending}
                  >
                    {createExpense.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Add {expenseType === "credit" ? "Income" : "Expense"}
                  </Button>
                </div>
              </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <Card className="glass">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">Income</p>
                  <p className="text-base sm:text-xl font-display font-bold text-success truncate">
                    {cur}{totalIncome.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">Expenses</p>
                  <p className="text-base sm:text-xl font-display font-bold text-destructive truncate">
                    {cur}{totalExpense.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">Balance</p>
                  <p className="text-base sm:text-xl font-display font-bold truncate">
                    {cur}{(totalIncome - totalExpense).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="debit">Expenses</SelectItem>
                  <SelectItem value="credit">Income</SelectItem>
                </SelectContent>
              </Select>
              {members.length > 1 && (
                <Select value={filterMember} onValueChange={setFilterMember}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.display_name ||
                          m.profile?.email ||
                          "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Expense List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-muted animate-pulse"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="glass">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">
                    {expenses.length === 0
                      ? "No expenses yet. Add your first one!"
                      : "No matching expenses found."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map((expense, i) => {
                  const canDelete = isOwner || expense.created_by === user?.id;
                  return (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card className="glass hover:shadow-md transition-shadow group overflow-hidden">
                        <span
                          className={`absolute right-0 top-[0px] rounded-l-full px-2 font-[500] text-sm`}
                          style={{
                            backgroundColor: expense.categories.color
                              ? expense.categories.color + 20
                              : "#0000080",
                            color: expense.categories.color
                              ? expense.categories.color
                              : "#00000",
                            // color: `color-contrast(${expense.categories.color} vs white, black)`,
                            // filter: "invert()",
                          }}
                        >
                          {expense.categories?.name ?? "Uncategorized"}
                        </span>
                        <CardContent className="p-4 flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor:
                                (expense.categories?.color ?? "#6B7280") + "20",
                              color: expense.categories?.color ?? "#6B7280",
                            }}
                          >
                            {expense.expense_type === "credit" ? (
                              <TrendingUp className="h-5 w-5" />
                            ) : (
                              <TrendingDown className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {expense.title}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                              {/* <span>
                                {expense.categories?.name ?? "Uncategorized"}
                              </span>
                              <span>•</span> */}

                              {expense.payment_method && (
                                <>
                                  <span className="capitalize">
                                    {expense.payment_method}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                              <span>
                                {new Date(expense.date).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-0.5">
                              <span className="inline-flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                                  {getInitials(
                                    expense.creator_profile?.display_name,
                                  )}
                                </span>
                                Added by{" "}
                                {expense.created_by === user!.id
                                  ? "You"
                                  : expense.creator_profile?.display_name ||
                                    "Unknown"}
                              </span>
                              {expense.paid_by !== expense.created_by &&
                                expense.payer_profile && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      Paid by{" "}
                                      {expense.payer_profile.display_name ||
                                        "Unknown"}
                                    </span>
                                  </>
                                )}
                            </div>
                          </div>
                          <p
                            className={`font-display font-bold text-lg shrink-0 ${expense.expense_type === "credit" ? "text-success" : "text-destructive"}`}
                          >
                            {expense.expense_type === "credit" ? "+" : "-"}
                            {cur}
                            {Number(expense.amount).toLocaleString()}
                          </p>
                          {canDelete && (
                            <>
                              <DropdownMenu modal>
                                <DropdownMenuTrigger className="cursor-pointer relative focus:outline-none">
                                  <EllipsisVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuContent
                                    className="DropdownMenuContent p-1 bg-white text-gray-700 text-sm font-[500] z-[999]"
                                    sideOffset={5}
                                  >
                                    <DropdownMenuItem
                                      className="DropdownMenuItem p-2 rounded hover:bg-red-50 text-destructive focus-visible:outline-none cursor-pointer"
                                      onClick={() => {
                                        if (confirm("Delete this expense?"))
                                          deleteExpense.mutate(expense.id);
                                      }}
                                    >
                                      <div className="flex gap-2 items-center">
                                        <div>
                                          <Trash2 className="h-4 w-4" />
                                        </div>
                                        <div>Delete</div>
                                      </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled
                                      className="DropdownMenuItem  p-2 rounded text-gray-400 focus-visible:outline-none cursor-not-allowed"
                                    >
                                      <div className="flex gap-2 items-center">
                                        <div>
                                          <Edit className="h-4 w-4" />
                                        </div>
                                        <div>Edit</div>
                                      </div>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenuPortal>
                              </DropdownMenu>

                              {/* <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this expense?"))
                                    deleteExpense.mutate(expense.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button> */}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Members sidebar - desktop only */}
          {showMembers && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:block w-72 shrink-0"
            >
              <Card className="glass sticky top-4">
                <CardContent className="p-4">
                  <BookMembers bookId={bookId!} />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Members sheet - mobile only */}
        <Sheet open={showMembers} onOpenChange={setShowMembers}>
          <SheetContent side="bottom" className="lg:hidden max-h-[80vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Members</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <BookMembers bookId={bookId!} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
