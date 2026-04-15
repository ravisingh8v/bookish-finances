import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/hooks/useAuth";
import { useBooks } from "@/hooks/useBooks";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { motion } from "framer-motion";
import { BookOpen, Loader2, Plus, Trash2, Users } from "lucide-react";
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
  const { books, isLoading, createBook, deleteBook, isBookOwner } = useBooks();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [color, setColor] = useState(COLORS[0]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Book name is required");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      currency,
      color,
    };

    if (!isOnline) {
      setOpen(false);
      setName("");
      setDescription("");
      setCurrency("INR");
      setColor(COLORS[0]);
      createBook.mutate(payload, {
        onError: (error: Error) => toast.error(error.message),
      });
      return;
    }

    try {
      await createBook.mutateAsync(payload);
      toast.success("Book created!");
      setOpen(false);
      setName("");
      setDescription("");
      setCurrency("INR");
      setColor(COLORS[0]);
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Book
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Expense Book</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 overflow-x-hidden">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., Trip with Friends"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="What's this book for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-full transition-transform ${color === c ? "ring-2 ring-primary scale-110" : "hover:scale-105"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="sticky bottom-0 bg-background pt-3">
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createBook.isPending}
                  >
                    {createBook.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Create Book
                  </Button>
                </div>
              </div>
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
                        <div className="flex items-center gap-2">
                          {userRole && (
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {userRole}
                            </Badge>
                          )}
                          {ownerCheck && (
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
    </DashboardLayout>
  );
}
