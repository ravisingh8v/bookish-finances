import { DashboardLayout } from "@/components/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { motion } from "framer-motion";
import {
  BookOpen,
  Copy,
  Edit,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function Books() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const {
    books,
    isLoading,
    createBook,
    updateBook,
    deleteBook,
    duplicateBook,
    isBookOwner,
  } = useBooks();
  const [open, setOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [color, setColor] = useState(COLORS[0]);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateBookId, setDuplicateBookId] = useState<string | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [includemembers, setIncludemembers] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setCurrency("INR");
    setColor(COLORS[0]);
    setEditingBook(null);
  };

  const handleDuplicate = (bookId: string, e: React.MouseEvent) => {
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

  const openEditDialog = (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    setName(book.name);
    setDescription(book.description ?? "");
    setCurrency(book.currency);
    setColor(book.color);
    setEditingBook(book);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Book name is required");
      return;
    }

    try {
      if (editingBook) {
        await updateBook.mutateAsync({
          bookId: editingBook.id,
          name: name.trim(),
          description: description.trim() || undefined,
          currency,
          color,
        });
        toast.success(
          isOnline
            ? "Book updated!"
            : "Book updated offline. Will sync when online.",
        );
      } else {
        await createBook.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          currency,
          color,
        });
        toast.success(
          isOnline
            ? "Book created!"
            : "Book saved offline. Will sync when online.",
        );
      }
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Expense Books</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Organize your expenses into separate books
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
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Book
              </Button>
            </DialogTrigger>
            <DialogContent fullscreen className="flex flex-col">
              <DialogHeader className="pb-6 sticky top-0 bg-background/95 backdrop-blur-sm pt-4 px-4 sm:px-6 z-40 border-b">
                <DialogTitle className="text-xl">
                  {editingBook ? "Edit Book" : "Create Expense Book"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label htmlFor="book-name" className="text-sm font-medium">
                      Name
                    </Label>
                    <Input
                      id="book-name"
                      placeholder="e.g., Trip with Friends"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="book-desc" className="text-sm font-medium">
                      Description (optional)
                    </Label>
                    <Input
                      id="book-desc"
                      placeholder="What's this book for?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label
                      htmlFor="book-currency"
                      className="text-sm font-medium"
                    >
                      Currency
                    </Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="book-currency" className="h-11">
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
                          onClick={() => setColor(c)}
                          className={`w-10 h-10 rounded-full transition-transform border-2 ${
                            color === c
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
                  onClick={handleSave}
                  disabled={createBook.isPending || updateBook.isPending}
                >
                  {(createBook.isPending || updateBook.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {editingBook ? "Save Changes" : "Create Book"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : books.length === 0 ? (
          <Card className="glass">
            <CardContent className="p-12 text-center space-y-4">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="font-display font-semibold text-lg">
                  No books yet
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Create your first expense book to get started
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book, i) => {
              const memberCount = book.members?.length ?? 0;
              const userRole = book.members?.find(
                (m) => m.user_id === user?.id,
              )?.role;
              const ownerCheck = isBookOwner(book);
              return (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className="glass hover:shadow-lg transition-all cursor-pointer group"
                    onClick={() => navigate(`/books/${book.id}`)}
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{
                            backgroundColor: book.color + "20",
                            color: book.color,
                          }}
                        >
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-1">
                          {book._offline && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-600 border-amber-500/30"
                            >
                              Offline
                            </Badge>
                          )}
                          {userRole && (
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {userRole}
                            </Badge>
                          )}
                          {ownerCheck && (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-display font-semibold truncate">
                          {book.name}
                        </h3>
                        {book.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {book.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{book.currency}</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {memberCount}
                        </span>
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 pt-2 border-t border-border/50">
                        {new Date(
                          book.updated_at && book.updated_at !== book.created_at
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

      <AlertDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      >
        <AlertDialogContent className="w-[calc(100%-1.5rem)] sm:w-full max-w-sm mx-auto rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Book</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 mt-4">
              <div className="space-y-2">
                <label htmlFor="duplicate-name" className="text-sm font-medium">
                  Book Name
                </label>
                <input
                  id="duplicate-name"
                  type="text"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  placeholder="Enter duplicated book name"
                  className="w-full h-10 px-3 rounded-md border border-input focus-visible:outline-primary bg-background text-foreground text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Customize the name for your duplicated book
              </p>
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <AlertDialogCancel className="order-2 sm:order-1">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
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
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
