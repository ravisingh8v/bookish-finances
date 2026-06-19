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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { Book, useBooks } from "@/hooks/useBooks";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { getBookTotals } from "@/lib/bookTotals";
import { formatINR } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Edit,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { DragEvent, PointerEvent, useRef, useState } from "react";
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
    reorderBooks,
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
  const draggedBookIdRef = useRef<string | null>(null);
  const pointerStartRef = useRef<{ bookId: string; x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setCurrency("INR");
    setColor(COLORS[0]);
    setEditingBook(null);
  };
  const bookIdsKey = books
    .map((book) => book.id)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  const { data: bookTotals = {} } = useQuery({
    queryKey: ["book-totals", bookIdsKey],
    queryFn: async () => {
      return await getBookTotals(books.map((book) => book.id));
    },
    enabled: books.length > 0 && isOnline,
    refetchOnWindowFocus: true,
  });


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
      toast.success("Book duplicated!");
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

  const handleBookDragStart = (event: DragEvent<HTMLDivElement>, bookId: string) => {
    draggedBookIdRef.current = bookId;
    dragMovedRef.current = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", bookId);
  };

  const handleBookDrop = (event: DragEvent<HTMLDivElement>, targetBookId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceBookId = draggedBookIdRef.current || event.dataTransfer.getData("text/plain");
    draggedBookIdRef.current = null;
    if (!sourceBookId || sourceBookId === targetBookId) return;
    dragMovedRef.current = true;
    reorderBookIds(sourceBookId, targetBookId);
  };

  const reorderBookIds = (sourceBookId: string, targetBookId: string) => {
    if (sourceBookId === targetBookId) return;
    const currentIds = books.map((book) => book.id);
    const sourceIndex = currentIds.indexOf(sourceBookId);
    const targetIndex = currentIds.indexOf(targetBookId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(targetIndex, 0, moved);
    reorderBooks.mutate(nextIds);
  };

  const handleBookPointerDown = (event: PointerEvent<HTMLDivElement>, bookId: string) => {
    if (!isOnline || event.pointerType === "mouse") return;
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,textarea,[role='button']")) return;
    pointerStartRef.current = { bookId, x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
  };

  const handleBookPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 18) {
      dragMovedRef.current = true;
    }
  };

  const handleBookPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !dragMovedRef.current) return;
    const targetBookId = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>("[data-book-id]"))
      .find(Boolean)?.dataset.bookId;
    if (targetBookId) reorderBookIds(start.bookId, targetBookId);
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 150);
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
        toast.success("Book updated!");
      } else {
        await createBook.mutateAsync({
          name: name.trim(),
          description: description.trim() || "",
          currency,
          color,
        });
        toast.success("Book created!");
      }
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 mt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Expense Books</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Organize your expenses into separate books
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">

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
                <DialogHeader className="pb-4 sticky top-0 bg-background/95 backdrop-blur-sm pt-2 px-4 sm:px-6 z-40 border-b">
                  <DialogTitle className="text-xl text-left">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => {
                        setOpen(false);
                        resetForm();
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
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
                        autoFocus
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
                      <Textarea
                        id="book-desc"
                        placeholder="What's this book for?"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="resize-none"
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
                            className={`w-10 h-10 rounded-full transition-transform border-2 ${color === c
                              ? "ring-2 ring-primary scale-110 border-primary"
                              : "sm:hover:scale-105 border-border"
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
                    className="glass sm:hover:shadow-lg transition-all cursor-pointer group"
                    data-book-id={book.id}
                    draggable={isOnline}
                    onDragStart={(event) => handleBookDragStart(event, book.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleBookDrop(event, book.id)}
                    onPointerDown={(event) => handleBookPointerDown(event, book.id)}
                    onPointerMove={handleBookPointerMove}
                    onPointerUp={handleBookPointerEnd}
                    onPointerCancel={() => {
                      pointerStartRef.current = null;
                      window.setTimeout(() => {
                        dragMovedRef.current = false;
                      }, 0);
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        draggedBookIdRef.current = null;
                        dragMovedRef.current = false;
                      }, 0);
                    }}
                    onClick={() => {
                      if (dragMovedRef.current) return;
                      navigate(`/books/${book.id}`);
                    }}
                  >
                    <CardContent className="p-4 space-y-2">
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
                          {false && null}

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
                                className="h-8 w-8 opacity-100 text-muted-foreground sm:hover:text-primary"
                                onClick={(e) => openEditDialog(book, e)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-100 text-muted-foreground sm:hover:text-blue-600 disabled:opacity-50"
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
                                className="h-8 w-8 opacity-100 text-muted-foreground sm:hover:text-destructive"
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
                      <div className="min-w-0">
                        <h3 className="font-display font-semibold truncate">
                          {book.name}
                        </h3>
                        {book.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words overflow-hidden max-h-[2.75rem] leading-tight">
                            {book.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span
                          className={
                            "font-medium " +
                            ` ${bookTotals[book.id] < 0 ? "text-red-600" : bookTotals[book.id] != 0 ? "text-green-600" : "text-foreground/80"}`
                          }
                        >
                          {book.currency} {formatINR(bookTotals[book.id] ?? 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {memberCount}
                        </span>
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground/50 pt-1.5 border-t border-border/50">
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
                  className="w-full h-10 rounded-md border border-input bg-white px-3 text-base text-foreground outline-offset-[2px] focus-visible:outline-primary"
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
              className="order-1 sm:order-2 bg-primary sm:hover:bg-primary/90"
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
