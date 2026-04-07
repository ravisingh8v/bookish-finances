import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useBooks } from "@/hooks/useBooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Trash2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#EF4444", "#14B8A6", "#F97316"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD"];

export default function Books() {
  const { books, isLoading, createBook, deleteBook } = useBooks();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [color, setColor] = useState(COLORS[0]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Book name is required"); return; }
    try {
      await createBook.mutateAsync({ name: name.trim(), description: description.trim() || undefined, currency, color });
      toast.success("Book created!");
      setOpen(false);
      setName(""); setDescription(""); setCurrency("INR"); setColor(COLORS[0]);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string, bookName: string) => {
    if (!confirm(`Delete "${bookName}"? This will also delete all expenses in this book.`)) return;
    try { await deleteBook.mutateAsync(id); toast.success("Book deleted"); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Expense Books</h1>
            <p className="text-muted-foreground text-sm mt-1">Organize your expenses into separate books</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Book</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Expense Book</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Book Name</Label>
                  <Input placeholder="e.g. Home Expenses" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input placeholder="What is this book for?" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : ""}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={createBook.isPending}>
                  {createBook.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Create Book
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : books.length === 0 ? (
          <Card className="glass">
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg mb-2">No books yet</h3>
              <p className="text-muted-foreground mb-4">Create your first expense book to start tracking</p>
              <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Book</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book, i) => (
              <motion.div key={book.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="glass hover:shadow-lg transition-all hover:-translate-y-0.5 group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <Link to={`/books/${book.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: book.color + "20", color: book.color }}>
                          <BookOpen className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{book.name}</h3>
                          <p className="text-xs text-muted-foreground">{book.currency} • {book.book_members?.length ?? 1} member(s)</p>
                        </div>
                      </Link>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(book.id, book.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {book.description && <p className="text-sm text-muted-foreground truncate">{book.description}</p>}
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
