import { BookMembers } from "@/components/BookMembers";
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
import { useBooks } from "@/hooks/useBooks";
import { useCategories, useExpenses } from "@/hooks/useExpenses";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { supabase } from "@/integrations/supabase/client";
import { withNetworkTimeout } from "@/lib/network";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Edit,
  EllipsisVertical,
  Filter,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
    icon: TrendingUp,
    color: "text-destructive",
  },
  {
    value: "credit",
    label: "Income",
    icon: TrendingDown,
    color: "text-success",
  },
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
  const { isOnline } = useOfflineSync();
  const { books } = useBooks();
  const cachedBook = books.find((candidate) => candidate.id === bookId);
  const {
    expenses,
    isLoading,
    createExpense,
    updateExpense,
    deleteExpense,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExpenses(bookId!);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: "100px" },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );
  const { data: categories } = useCategories();
  const { members, isOwner, currentUserRole } = useBookMembers(bookId!);
  const [open, setOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempFilterType, setTempFilterType] = useState<string>("all");
  const [tempFilterMember, setTempFilterMember] = useState<string>("all");

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [expenseType, setExpenseType] = useState("debit");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => {
      const { data, error } = await withNetworkTimeout(
        supabase.from("expense_books").select("*").eq("id", bookId!).single(),
      );
      if (error) throw error;
      return data;
    },
    enabled: !!bookId && isOnline,
    initialData: cachedBook,
  });

  const book = bookQuery.data ?? cachedBook;
  const cachedUserRole = cachedBook?.members?.find(
    (member) => member.user_id === user?.id,
  )?.role;
  const effectiveRole = currentUserRole ?? cachedUserRole;
  const canEdit = effectiveRole === "owner" || effectiveRole === "editor";

  if (!bookQuery.isLoading && !book) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-display font-bold">
            {isOnline ? "Access Denied" : "Unavailable Offline"}
          </h2>
          <p className="text-muted-foreground">
            {isOnline
              ? "You don't have access to this book or it doesn't exist."
              : "This book isn't cached yet. Open it once while online to use it offline."}
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
    setEditingExpenseId(null);
  };

  const handleEditExpense = (expense: (typeof expenses)[number]) => {
    setTitle(expense.title);
    setAmount(String(expense.amount));
    setDate(
      expense.date?.split("T")[0] ?? new Date().toISOString().split("T")[0],
    );
    setCategoryId(expense.category_id ?? "");
    setExpenseType(expense.expense_type ?? "debit");
    setPaymentMethod(expense.payment_method ?? "cash");
    setNotes(expense.notes ?? "");
    setEditingExpenseId(expense.id);
    setOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Valid amount is required");
      return;
    }

    const payload = {
      title: title.trim(),
      amount: Number(amount),
      date,
      category_id: categoryId || undefined,
      expense_type: expenseType,
      payment_method: paymentMethod,
      notes: notes.trim() || undefined,
    };

    const isEditing = Boolean(editingExpenseId);
    const currentEditingExpenseId = editingExpenseId;

    // Close modal immediately for snappy UX
    setOpen(false);
    resetForm();

    try {
      if (isEditing) {
        await updateExpense.mutateAsync({
          expenseId: currentEditingExpenseId!,
          ...payload,
        });
        toast.success(
          isOnline
            ? "Expense updated!"
            : "Expense updated offline. Will sync when online.",
        );
      } else {
        await createExpense.mutateAsync({ book_id: bookId!, ...payload });
        toast.success(
          isOnline
            ? "Expense added!"
            : "Saved offline. Will sync when internet is available.",
        );
      }
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
              <Dialog
                open={open}
                onOpenChange={(value) => {
                  if (!value) resetForm();
                  setOpen(value);
                }}
              >
                <DialogTrigger asChild>
                  <Button className="gap-2 h-9 px-3 sm:px-4">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Expense</span>
                  </Button>
                </DialogTrigger>
                <DialogContent fullscreen className="flex flex-col">
                  <DialogHeader className="pb-6 sticky top-0 bg-background/95 backdrop-blur-sm pt-4 px-4 sm:px-6 z-40 border-b">
                    <DialogTitle className="text-xl">
                      {editingExpenseId ? "Edit Expense" : "Add Expense"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        {EXPENSE_TYPES.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => setExpenseType(t.value)}
                            className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                              expenseType === t.value
                                ? t.value === "debit"
                                  ? "border-destructive bg-destructive/10 text-destructive"
                                  : "border-primary bg-primary/10 text-primary"
                                : t.value === "debit"
                                  ? "border-border text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                                  : "border-border text-primary hover:border-primary hover:bg-primary/10"
                            }`}
                          >
                            <t.icon className="h-4 w-4" />
                            <span>{t.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <Label
                          htmlFor="expense-title"
                          className="text-sm font-medium"
                        >
                          Title
                        </Label>
                        <Input
                          id="expense-title"
                          placeholder="What did you spend on?"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-3">
                          <Label
                            htmlFor="expense-amount"
                            className="text-sm font-medium"
                          >
                            Amount
                          </Label>
                          <Input
                            id="expense-amount"
                            type="number"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="expense-date"
                            className="text-sm font-medium"
                          >
                            Date
                          </Label>
                          <Input
                            id="expense-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-11"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-3">
                          <Label
                            htmlFor="expense-category"
                            className="text-sm font-medium"
                          >
                            Category
                          </Label>
                          <Select
                            value={categoryId}
                            onValueChange={setCategoryId}
                          >
                            <SelectTrigger
                              id="expense-category"
                              className="h-11"
                            >
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
                        <div className="space-y-3">
                          <Label
                            htmlFor="expense-payment"
                            className="text-sm font-medium"
                          >
                            Payment
                          </Label>
                          <Select
                            value={paymentMethod}
                            onValueChange={setPaymentMethod}
                          >
                            <SelectTrigger
                              id="expense-payment"
                              className="h-11"
                            >
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
                      <div className="space-y-3">
                        <Label
                          htmlFor="expense-notes"
                          className="text-sm font-medium"
                        >
                          Notes (optional)
                        </Label>
                        <Textarea
                          id="expense-notes"
                          placeholder="Any additional details..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="w-full h-11 sm:w-auto"
                      onClick={handleSaveExpense}
                      disabled={
                        createExpense.isPending || updateExpense.isPending
                      }
                    >
                      {createExpense.isPending || updateExpense.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {editingExpenseId
                        ? "Save Changes"
                        : `Add ${expenseType === "credit" ? "Income" : "Expense"}`}
                    </Button>
                  </DialogFooter>
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
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Income
                  </p>
                  <p className="text-base sm:text-xl font-display font-bold text-success truncate">
                    {cur}
                    {totalIncome.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Expenses
                  </p>
                  <p className="text-base sm:text-xl font-display font-bold text-destructive truncate">
                    {cur}
                    {totalExpense.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Balance
                  </p>
                  <p className="text-base sm:text-xl font-display font-bold truncate">
                    {cur}
                    {(totalIncome - totalExpense).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters - Inline for Desktop, Modal for Mobile */}
            {/* Desktop Inline Filters */}
            <div className="hidden lg:flex flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  className="pl-9"
                  value={search}
                  onChange={(e: any) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36">
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
                  <SelectTrigger className="w-44">
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

            {/* Mobile/Tablet Filter Modal */}
            <div className="lg:hidden flex gap-2 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  className="pl-9"
                  value={search}
                  onChange={(e: any) => setSearch(e.target.value)}
                />
              </div>
              <Dialog open={showFilterModal} onOpenChange={setShowFilterModal}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => {
                      setTempFilterType(filterType);
                      setTempFilterMember(filterMember);
                    }}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100%-1.5rem)] sm:w-full max-w-sm rounded-lg mx-auto">
                  <DialogHeader className="pb-4 border-b">
                    <DialogTitle className="text-lg">Filters</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Type</Label>
                      <Select
                        value={tempFilterType}
                        onValueChange={setTempFilterType}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="debit">Expenses</SelectItem>
                          <SelectItem value="credit">Income</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {members.length > 1 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Member</Label>
                        <Select
                          value={tempFilterMember}
                          onValueChange={setTempFilterMember}
                        >
                          <SelectTrigger className="h-9">
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
                      </div>
                    )}
                  </div>
                  <DialogFooter className="flex gap-2 border-t pt-4">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTempFilterType("all");
                        setTempFilterMember("all");
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowFilterModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setFilterType(tempFilterType);
                        setFilterMember(tempFilterMember);
                        setShowFilterModal(false);
                      }}
                    >
                      Apply
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Offline indicator */}
            <AnimatePresence mode="wait">
              {!isOnline && (
                <motion.div
                  key="offline-indicator"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-900"
                >
                  <p className="font-medium">Viewing cached data</p>
                  <p className="text-amber-800 text-xs mt-1">
                    You're offline. New actions will sync when back online.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

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
                      <Card className="glass hover:shadow-md transition-shadow group">
                        <CardContent className="p-3 sm:p-4 flex flex-col gap-3">
                          {/* Top Row: Icon, Title, Amount, Actions */}
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                              style={{
                                backgroundColor:
                                  (expense.categories?.color ?? "#6B7280") +
                                  "20",
                                color: expense.categories?.color ?? "#6B7280",
                              }}
                            >
                              {expense.expense_type === "credit" ? (
                                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                              ) : (
                                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2 justify-between mb-1">
                                <p className="font-medium truncate">
                                  {expense.title}
                                </p>
                                <span
                                  className="text-[9px] sm:text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: expense.categories?.color
                                      ? `${expense.categories.color}20`
                                      : "hsl(var(--muted))",
                                    color:
                                      expense.categories?.color ??
                                      "hsl(var(--muted-foreground))",
                                  }}
                                >
                                  {expense.categories?.name ?? "Uncategorized"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                                {expense.payment_method && (
                                  <span className="capitalize px-1.5 py-0.5 bg-muted rounded text-[10px]">
                                    {expense.payment_method}
                                  </span>
                                )}
                                {expense._offline && (
                                  <span className="text-amber-600 text-[10px] px-1.5 py-0.5 bg-amber-50 rounded">
                                    Pending sync
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <p
                                className={`font-display font-bold text-sm sm:text-base ${expense.expense_type === "credit" ? "text-success" : "text-destructive"}`}
                              >
                                {expense.expense_type === "credit" ? "+" : "-"}
                                {cur}
                                {Number(expense.amount).toLocaleString()}
                              </p>
                              {(canDelete || canEdit) && (
                                <DropdownMenu modal>
                                  <DropdownMenuTrigger className="cursor-pointer relative focus:outline-none h-5 w-5 flex items-center justify-center">
                                    <EllipsisVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuPortal>
                                    <DropdownMenuContent
                                      className="DropdownMenuContent p-1 bg-white text-gray-700 text-sm font-medium z-[999] rounded-lg shadow-lg border"
                                      sideOffset={5}
                                    >
                                      {canEdit && (
                                        <DropdownMenuItem
                                          className="DropdownMenuItem p-2 rounded hover:bg-accent hover:text-accent-foreground focus-visible:outline-none cursor-pointer"
                                          onClick={() =>
                                            handleEditExpense(expense)
                                          }
                                        >
                                          <div className="flex gap-2 items-center">
                                            <Edit className="h-4 w-4" />
                                            <span>Edit</span>
                                          </div>
                                        </DropdownMenuItem>
                                      )}
                                      {canDelete && (
                                        <DropdownMenuItem
                                          className="DropdownMenuItem p-2 rounded hover:bg-red-50 text-destructive focus-visible:outline-none cursor-pointer"
                                          onClick={() => {
                                            if (confirm("Delete this expense?"))
                                              deleteExpense.mutate(expense.id);
                                          }}
                                        >
                                          <div className="flex gap-2 items-center">
                                            <Trash2 className="h-4 w-4" />
                                            <span>Delete</span>
                                          </div>
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenuPortal>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>

                          {/* Middle Row: User Info */}
                          <div className="flex flex-col gap-1 text-[11px] text-muted-foreground/70 pl-0 sm:pl-10">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                                {getInitials(
                                  expense.creator_profile?.display_name,
                                )}
                              </span>
                              <span className="truncate">
                                Added by{" "}
                                {expense.created_by === user?.id
                                  ? "You"
                                  : expense.creator_profile?.display_name ||
                                    "Unknown"}
                              </span>
                            </span>
                            {expense.paid_by !== expense.created_by &&
                              expense.payer_profile && (
                                <span className="truncate">
                                  Paid by{" "}
                                  {expense.payer_profile.display_name ||
                                    "Unknown"}
                                </span>
                              )}
                          </div>

                          {/* Bottom Row: Single Timestamp (No Label) */}
                          <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 pt-1.5 border-t border-border/50 pl-0 sm:pl-10">
                            {new Date(
                              expense.updated_at &&
                                expense.updated_at !== expense.created_at
                                ? expense.updated_at
                                : expense.created_at,
                            ).toLocaleString("en-IN", {
                              month: "short",
                              day: "numeric",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
                {/* Infinite scroll sentinel */}
                {hasNextPage && (
                  <div ref={sentinelRef} className="flex justify-center py-4">
                    {isFetchingNextPage && (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
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
        <Sheet open={showMembers && !isDesktop} onOpenChange={setShowMembers}>
          <SheetContent
            side="bottom"
            className="lg:hidden max-h-[80vh] overflow-y-auto rounded-t-2xl"
          >
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
