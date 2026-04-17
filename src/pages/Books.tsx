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
import { Checkbox } from "@/components/ui/checkbox";
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
import { BookOpen, Copy, Edit, Loader2, Plus, Trash2, Users, WifiOff } from "lucide-react";
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
  const { books, isLoading, createBook, updateBook, deleteBook, duplicateBook, isBookOwner } =
    useBooks();
  const [duplicating, setDuplicating] = useState<Book | null>(null);
  const [copyMembers, setCopyMembers] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [color, setColor] = useState(COLORS[0]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setCurrency("INR");
    setColor(COLORS[0]);
    setEditingBook(null);
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
                                className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isOnline) {
                                    toast.error(
                                      "Book duplication requires internet connection",
                                    );
                                    return;
                                  }
                                  setCopyMembers(false);
                                  setDuplicating(book);
                                }}
                                title="Duplicate book"
                              >
                                <Copy className="h-4 w-4" />
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
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Duplicate book dialog */}
      <Dialog
        open={!!duplicating}
        onOpenChange={(v) => {
          if (!v) setDuplicating(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Book</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isOnline ? (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 p-3 rounded-lg">
                <WifiOff className="h-4 w-4" />
                Book duplication requires internet connection
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This will create a copy of{" "}
                  <span className="font-medium text-foreground">
                    {duplicating?.name}
                  </span>{" "}
                  with all its expenses.
                </p>
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={copyMembers}
                    onCheckedChange={(c) => setCopyMembers(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Copy members as well</p>
                    <p className="text-xs text-muted-foreground">
                      Include all current members in the duplicated book
                    </p>
                  </div>
                </label>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDuplicating(null)}
              disabled={duplicateBook.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!duplicating || !isOnline) return;
                try {
                  await duplicateBook.mutateAsync({
                    bookId: duplicating.id,
                    copyMembers,
                  });
                  toast.success("Book duplicated!");
                  setDuplicating(null);
                } catch (e: any) {
                  toast.error(e.message || "Failed to duplicate book");
                }
              }}
              disabled={!isOnline || duplicateBook.isPending}
            >
              {duplicateBook.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
