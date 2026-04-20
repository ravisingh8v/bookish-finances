import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAuth } from "@/hooks/useAuth";
import { Book, useBooks } from "@/hooks/useBooks";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { withNetworkTimeout } from "@/lib/network";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BookOpen,
  Copy,
  Edit,
  Loader2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY"];
const COLORS = [
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#06B6D4",
];

export default function Dashboard() {
  const { profile, user } = useAuth();
  const {
    books,
    isLoading,
    updateBook,
    deleteBook,
    duplicateBook,
    isBookOwner,
  } = useBooks();
  const { isOnline } = useOfflineSync();

  // Edit dialog state
  const [openEdit, setOpenEdit] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCurrency, setEditCurrency] = useState("INR");
  const [editColor, setEditColor] = useState(COLORS[0]);

  // Duplicate dialog state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateBookId, setDuplicateBookId] = useState<string | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [includemembers, setIncludemembers] = useState(false);

  const resetEditForm = () => {
    setEditName("");
    setEditDescription("");
    setEditCurrency("INR");
    setEditColor(COLORS[0]);
    setEditingBook(null);
  };

  const openEditDialog = (book: Book, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditName(book.name);
    setEditDescription(book.description ?? "");
    setEditCurrency(book.currency);
    setEditColor(book.color);
    setEditingBook(book);
    setOpenEdit(true);
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      toast.error("Book name is required");
      return;
    }

    if (!editingBook) return;

    try {
      await updateBook.mutateAsync({
        bookId: editingBook.id,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        currency: editCurrency,
        color: editColor,
      });
      toast.success(
        isOnline
          ? "Book updated!"
          : "Book updated offline. Will sync when online.",
      );
      setOpenEdit(false);
      resetEditForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDuplicate = (bookId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOnline) {
      toast.error("Book duplication requires internet connection");
      return;
    }
    const book = books.find((b) => b.id === bookId);
    if (book) {
      setDuplicateBookId(bookId);
      setDuplicateName(`${book.name} (Copy)`);
      setIncludemembers(false);
      setDuplicateDialogOpen(true);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!duplicateBookId) return;

    try {
      await duplicateBook.mutateAsync({
        bookId: duplicateBookId,
        includemembers,
        customName: duplicateName,
      });
      toast.success("Book duplicated! It will sync when online.");
      setDuplicateDialogOpen(false);
      setDuplicateBookId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      if (!isOnline) {
        const cached = await db.dashboard.get("stats");
        if (cached?.data)
          return cached.data as {
            totalExpense: number;
            totalIncome: number;
            balance: number;
            count: number;
          };

        const all = await db.expenses.toArray();
        const expenses = all.flatMap((item) => (item.expenses ?? []) as any[]);
        const totalExpense =
          expenses
            .filter((e) => e.expense_type === "debit")
            .reduce((s, e) => s + Number(e.amount), 0) ?? 0;
        const totalIncome =
          expenses
            .filter((e) => e.expense_type === "credit")
            .reduce((s, e) => s + Number(e.amount), 0) ?? 0;
        const data = {
          totalExpense,
          totalIncome,
          balance: totalIncome - totalExpense,
          count: expenses.length,
        };
        await db.dashboard.put({ id: "stats", data, cachedAt: Date.now() });
        return data;
      }

      const { data: expenses } = await withNetworkTimeout(
        supabase
          .from("expenses")
          .select(
            "amount , expense_type,  expense_books!inner(id,name,book_members!inner(user_id,role))",
          )
          .eq("expense_books.book_members.user_id", user.id)
          .eq("paid_by", user.id),
      );
      const totalExpense =
        expenses
          ?.filter((e) => e.expense_type === "debit")
          .reduce((s, e) => s + Number(e.amount), 0) ?? 0;
      const totalIncome =
        expenses
          ?.filter((e) => e.expense_type === "credit")
          .reduce((s, e) => s + Number(e.amount), 0) ?? 0;
      return {
        totalExpense,
        totalIncome,
        balance: totalIncome - totalExpense,
        count: expenses?.length ?? 0,
      };
    },
    enabled: !!user,
  });

  const stats = statsQuery.data ?? {
    totalExpense: 0,
    totalIncome: 0,
    balance: 0,
    count: 0,
  };

  const statCards = [
    {
      title: "Total Balance",
      value: `₹${stats.balance.toLocaleString()}`,
      icon: Wallet,
      color: "text-primary",
    },
    {
      title: "Income",
      value: `₹${stats.totalIncome.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-success",
    },
    {
      title: "Expenses",
      value: `₹${stats.totalExpense.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-destructive",
    },
    {
      title: "Books",
      value: books.length.toString(),
      icon: BookOpen,
      color: "text-accent",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-display font-bold">
            Welcome, {profile?.display_name ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's your financial overview
          </p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="glass hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-display font-bold mt-1">
                        {stat.value}
                      </p>
                    </div>
                    <div
                      className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${stat.color}`}
                    >
                      <stat.icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-semibold">Recent Books</h2>
            <Link to="/books" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-xl bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <Card className="glass">
              <CardContent className="p-8 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No expense books yet. Create one to get started!
                </p>
                <Link
                  to="/books"
                  className="text-primary text-sm mt-2 inline-block hover:underline"
                >
                  Create your first book →
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.slice(0, 6).map((book, i) => {
                const ownerCheck = isBookOwner(book);
                const userRole = book.members?.find(
                  (m) => m.user_id === user?.id,
                )?.role;
                return (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="glass hover:shadow-lg transition-all hover:-translate-y-0.5 group relative">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                              style={{
                                backgroundColor: book.color + "20",
                                color: book.color,
                              }}
                            >
                              <BookOpen className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold truncate">
                                {book.name}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {book.currency}
                              </p>
                            </div>
                          </div>
                          {ownerCheck && (
                            <div className="flex items-center gap-1 ml-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-primary"
                                onClick={(e) => openEditDialog(book, e)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-blue-600 disabled:opacity-50"
                                onClick={(e) => handleDuplicate(book.id, e)}
                                disabled={duplicateBook.isPending || !isOnline}
                                title={
                                  !isOnline
                                    ? "Book duplication requires internet"
                                    : "Duplicate this book"
                                }
                              >
                                {duplicateBook.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      "Delete this book and all its expenses?",
                                    )
                                  )
                                    deleteBook.mutate(book.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {book.description && (
                          <p className="text-sm text-muted-foreground truncate">
                            {book.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <Link
                            to={`/books/${book.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            View book →
                          </Link>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {book.members?.length ?? 0}
                          </span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 pt-2 border-t border-border/50">
                          {new Date(
                            book.updated_at &&
                              book.updated_at !== book.created_at
                              ? book.updated_at
                              : book.created_at,
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
            </div>
          )}
        </div>

        {/* Edit Book Dialog */}
        <Dialog
          open={openEdit}
          onOpenChange={(v) => {
            if (!v) resetEditForm();
            setOpenEdit(v);
          }}
        >
          <DialogContent fullscreen className="flex flex-col">
            <DialogHeader className="pb-6 sticky top-0 bg-background/95 backdrop-blur-sm pt-4 px-4 sm:px-6 z-40 border-b">
              <DialogTitle className="text-xl">Edit Book</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label
                    htmlFor="edit-book-name"
                    className="text-sm font-medium"
                  >
                    Name
                  </Label>
                  <Input
                    id="edit-book-name"
                    placeholder="e.g., Trip with Friends"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-3">
                  <Label
                    htmlFor="edit-book-desc"
                    className="text-sm font-medium"
                  >
                    Description (optional)
                  </Label>
                  <Input
                    id="edit-book-desc"
                    placeholder="What's this book for?"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-3">
                  <Label
                    htmlFor="edit-book-currency"
                    className="text-sm font-medium"
                  >
                    Currency
                  </Label>
                  <Select value={editCurrency} onValueChange={setEditCurrency}>
                    <SelectTrigger id="edit-book-currency" className="h-11">
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
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Color</Label>
                  <div className="flex flex-wrap gap-3">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-10 h-10 rounded-full transition-transform border-2 ${
                          editColor === c
                            ? "ring-2 ring-primary scale-110 border-primary"
                            : "hover:scale-105 border-border"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                className="w-full h-11 sm:w-auto"
                onClick={handleEditSave}
                disabled={updateBook.isPending}
              >
                {updateBook.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Book Dialog */}
        <Dialog
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
        >
          <DialogContent className="w-[calc(100%-1.5rem)] sm:w-full max-w-sm mx-auto rounded-lg">
            <DialogHeader>
              <DialogTitle>Duplicate Book</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="duplicate-name" className="text-sm font-medium">
                  Book Name
                </Label>
                <Input
                  id="duplicate-name"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  placeholder="Enter duplicated book name"
                  className="h-11"
                />
              </div>
              <div className="flex items-center gap-3 bg-muted p-3 rounded-lg">
                <input
                  type="checkbox"
                  id="include-members"
                  checked={includemembers}
                  onChange={(e) => setIncludemembers(e.target.checked)}
                  className="w-4 h-4"
                />
                <label
                  htmlFor="include-members"
                  className="text-sm cursor-pointer flex-1"
                >
                  Copy members and their roles
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Expenses will always be copied.
              </p>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setDuplicateDialogOpen(false)}
                className="order-2 sm:order-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDuplicate}
                disabled={duplicateBook.isPending}
                className="order-1 sm:order-2 bg-primary hover:bg-primary/90"
              >
                {duplicateBook.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Duplicating...
                  </>
                ) : (
                  "Duplicate"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
