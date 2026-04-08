import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useBooks } from "@/hooks/useBooks";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookOpen, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { profile, user } = useAuth();
  const { books, isLoading } = useBooks();

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: expenses } = await supabase
        .from("expenses")
        .select(
          "amount , expense_type,  expense_books!inner(id,name,book_members!inner(user_id,role))",
        )
        .eq("expense_books.book_members.user_id", user.id)
        .eq("paid_by", user.id);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {books.slice(0, 6).map((book, i) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link to={`/books/${book.id}`}>
                    <Card className="glass hover:shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
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
                        {book.description && (
                          <p className="text-sm text-muted-foreground truncate">
                            {book.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
