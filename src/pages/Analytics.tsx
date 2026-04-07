import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion } from "framer-motion";

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#EF4444", "#14B8A6", "#F97316", "#6366F1", "#22C55E", "#6B7280"];

export default function Analytics() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const { data: expenses } = await supabase.from("expenses").select("*, categories(name, color)");
      if (!expenses) return { byCategory: [], byMonth: [], byType: [] };

      const catMap: Record<string, { name: string; total: number; color: string }> = {};
      const monthMap: Record<string, { income: number; expense: number }> = {};

      for (const e of expenses) {
        const catName = e.categories?.name ?? "Uncategorized";
        const catColor = e.categories?.color ?? "#6B7280";
        if (!catMap[catName]) catMap[catName] = { name: catName, total: 0, color: catColor };
        if (e.expense_type === "debit") catMap[catName].total += Number(e.amount);

        const month = new Date(e.date).toLocaleDateString("en", { month: "short", year: "2-digit" });
        if (!monthMap[month]) monthMap[month] = { income: 0, expense: 0 };
        if (e.expense_type === "credit") monthMap[month].income += Number(e.amount);
        else if (e.expense_type === "debit") monthMap[month].expense += Number(e.amount);
      }

      return {
        byCategory: Object.values(catMap).filter(c => c.total > 0).sort((a, b) => b.total - a.total),
        byMonth: Object.entries(monthMap).map(([month, data]) => ({ month, ...data })),
      };
    },
    enabled: !!user,
  });

  const byCategory = data?.byCategory ?? [];
  const byMonth = data?.byMonth ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-display font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Visualize your spending patterns</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass">
            <CardHeader><CardTitle className="font-display text-lg">Spending by Category</CardTitle></CardHeader>
            <CardContent>
              {byCategory.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No expense data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader><CardTitle className="font-display text-lg">Monthly Overview</CardTitle></CardHeader>
            <CardContent>
              {byMonth.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="income" fill="hsl(152, 69%, 40%)" radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="expense" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="Expense" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {byCategory.length > 0 && (
          <Card className="glass">
            <CardHeader><CardTitle className="font-display text-lg">Category Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {byCategory.map((cat, i) => {
                  const max = byCategory[0].total;
                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-sm font-medium w-28 truncate">{cat.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(cat.total / max) * 100}%` }} transition={{ delay: i * 0.1, duration: 0.5 }}
                          className="h-full rounded-full" style={{ backgroundColor: cat.color }} />
                      </div>
                      <span className="text-sm font-display font-medium w-24 text-right">₹{cat.total.toLocaleString()}</span>
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
