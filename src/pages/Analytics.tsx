import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useBooks } from "@/hooks/useBooks";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS_FALLBACK = [
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#EF4444",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#22C55E",
  "#6B7280",
];

export default function Analytics() {
  const { user } = useAuth();
  const { books } = useBooks();
  const [selectedBook, setSelectedBook] = useState<string>("all");
  const [selectedMember, setSelectedMember] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["analytics", selectedBook, selectedMember],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select(
          "*, categories(name, color), expense_books!inner(id,name,book_members!inner(user_id,role))",
        )
        .eq("expense_books.book_members.user_id", user.id)
        .eq("paid_by", user.id);
      if (selectedBook !== "all") query = query.eq("book_id", selectedBook);
      if (selectedMember !== "all")
        query = query.eq("created_by", selectedMember);

      const { data: expenses } = await query;
      if (!expenses) return { byCategory: [], byMonth: [], memberTotals: [] };

      const catMap: Record<
        string,
        { name: string; total: number; color: string }
      > = {};
      const monthMap: Record<string, { income: number; expense: number }> = {};
      const memberMap: Record<string, number> = {};

      // Fetch profiles for member breakdown
      const memberIds = [...new Set(expenses.map((e) => e.created_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", memberIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      for (const e of expenses) {
        const catName = e.categories?.name ?? "Uncategorized";
        const catColor = e.categories?.color ?? "#6B7280";
        if (!catMap[catName])
          catMap[catName] = { name: catName, total: 0, color: catColor };
        if (e.expense_type === "debit")
          catMap[catName].total += Number(e.amount);

        const month = new Date(e.date).toLocaleDateString("en", {
          month: "short",
          year: "2-digit",
        });
        if (!monthMap[month]) monthMap[month] = { income: 0, expense: 0 };
        if (e.expense_type === "credit")
          monthMap[month].income += Number(e.amount);
        else if (e.expense_type === "debit")
          monthMap[month].expense += Number(e.amount);

        if (e.expense_type === "debit") {
          memberMap[e.created_by] =
            (memberMap[e.created_by] ?? 0) + Number(e.amount);
        }
      }

      const memberTotals = Object.entries(memberMap)
        .map(([uid, total]) => {
          const p = profileMap.get(uid);
          return {
            name: p?.display_name || p?.email || "Unknown",
            total,
            userId: uid,
          };
        })
        .sort((a, b) => b.total - a.total);

      return {
        byCategory: Object.values(catMap)
          .filter((c) => c.total > 0)
          .sort((a, b) => b.total - a.total),
        byMonth: Object.entries(monthMap).map(([month, d]) => ({
          month,
          ...d,
        })),
        memberTotals,
      };
    },
    enabled: !!user,
  });

  const byCategory = data?.byCategory ?? [];
  const byMonth = data?.byMonth ?? [];
  const memberTotals = data?.memberTotals ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-display font-bold">Analytics</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Visualize your spending patterns
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                value={selectedBook}
                onValueChange={(v) => {
                  setSelectedBook(v);
                  setSelectedMember("all");
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All Books" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Books</SelectItem>
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Spending by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {byCategory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No expense data yet
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {byCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Monthly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {byMonth.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No data yet
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byMonth}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Legend />
                    <Bar
                      dataKey="income"
                      fill="hsl(152, 69%, 40%)"
                      radius={[4, 4, 0, 0]}
                      name="Income"
                    />
                    <Bar
                      dataKey="expense"
                      fill="hsl(0, 72%, 51%)"
                      radius={[4, 4, 0, 0]}
                      name="Expense"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Member spending breakdown */}
        {memberTotals.length > 1 && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Spending by Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {memberTotals.map((m, i) => {
                  const max = memberTotals[0].total;
                  return (
                    <div key={m.userId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {m.name[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="text-sm font-medium w-28 truncate">
                        {m.name}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(m.total / max) * 100}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5 }}
                          className="h-full rounded-full bg-primary"
                        />
                      </div>
                      <span className="text-sm font-display font-medium w-24 text-right">
                        {m.total.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {byCategory.length > 0 && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Category Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {byCategory.map((cat, i) => {
                  const max = byCategory[0].total;
                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm font-medium w-28 truncate">
                        {cat.name}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(cat.total / max) * 100}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      </div>
                      <span className="text-sm font-display font-medium w-24 text-right">
                        {cat.total.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
