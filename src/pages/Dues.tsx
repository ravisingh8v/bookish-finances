import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DueForm, type DuePayload } from "@/components/DueForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  buildDueSchedule,
  daysUntil,
  formatDueDate,
  getNextScheduleEntry,
  getTotalPaid,
  useDues,
  type DueEntry,
} from "@/hooks/useDues";
import { CalendarClock, Pencil, Plus, Trash2, Wallet } from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

const TYPE_LABEL: Record<string, string> = {
  "one-time": "One-time",
  installment: "Installments",
  emi: "EMI",
};

function dueTiming(due: DueEntry) {
  const next = getNextScheduleEntry(due);
  if (!next) return { text: "Fully paid", tone: "settled" as const, next };
  const days = daysUntil(next.date);
  if (days === null) return { text: "No date set", tone: "muted" as const, next };
  if (days < 0)
    return {
      text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
      tone: "late" as const,
      next,
    };
  if (days === 0) return { text: "Due today", tone: "soon" as const, next };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" as const, next };
  return { text: `Due in ${days} days`, tone: "ok" as const, next };
}

const TONE_CLASS: Record<string, string> = {
  late: "bg-destructive/10 text-destructive",
  soon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ok: "bg-muted text-muted-foreground",
  muted: "bg-muted text-muted-foreground",
  settled: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export default function Dues() {
  const { dues, totals, addDue, updateDue, deleteDue } = useDues();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DueEntry | null>(null);

  const overdueCount = useMemo(
    () => dues.filter((d) => dueTiming(d).tone === "late").length,
    [dues],
  );

  const summary = [
    { label: "Outstanding", value: money(totals.outstanding) },
    { label: "Paid", value: money(totals.paid) },
    { label: "Overdue", value: String(overdueCount) },
  ];

  const handleSubmit = async (payload: DuePayload) => {
    if (editing) await updateDue({ id: editing.id, ...payload });
    else await addDue(payload);
    setEditing(null);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold sm:text-2xl">Dues</h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              What you owe, when the next payment lands, and how much is left.
            </p>
          </div>
          <Button
            className="h-10 shrink-0 gap-2 px-3 sm:px-4"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add due</span>
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {summary.map((item) => (
            <Card key={item.label} className="glass">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-bold sm:text-lg">
                  {item.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {dues.length === 0 ? (
          <Card className="glass">
            <CardContent className="space-y-3 p-10 text-center">
              <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No dues tracked yet</p>
              <p className="text-sm text-muted-foreground">
                Add a due to plan one-time payments, installments or EMIs.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {dues.map((due) => {
              const paid = getTotalPaid(due);
              const outstanding = Math.max(0, due.totalAmount - paid);
              const pct = due.totalAmount
                ? Math.min(100, (paid / due.totalAmount) * 100)
                : 0;
              const timing = dueTiming(due);
              const schedule = buildDueSchedule(due);
              const paidCount = schedule.filter((_, i) => {
                const cumulative = schedule
                  .slice(0, i + 1)
                  .reduce((s, e) => s + e.amount, 0);
                return paid >= cumulative - 0.01;
              }).length;

              return (
                <Card key={due.id} className="glass overflow-hidden">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-semibold">
                            {due.title}
                          </h2>
                          <Badge variant="secondary" className="shrink-0">
                            {TYPE_LABEL[due.frequency] ?? due.frequency}
                          </Badge>
                        </div>
                        <p
                          className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[timing.tone]}`}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {timing.text}
                          {timing.next && ` · ${formatDueDate(timing.next.date)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Edit due"
                          onClick={() => {
                            setEditing(due);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground sm:hover:text-destructive"
                          aria-label="Delete due"
                          onClick={() => {
                            if (confirm("Delete this due?")) deleteDue(due.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {timing.next && schedule.length > 1 && (
                      <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                        Next payment{" "}
                        <span className="font-semibold text-foreground">
                          {money(timing.next.amount)}
                        </span>{" "}
                        on {formatDueDate(timing.next.date)} · payment{" "}
                        {timing.next.number} of {schedule.length}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-lg bg-muted/60 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Total
                        </p>
                        <p className="text-sm font-semibold">
                          {money(due.totalAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/60 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Paid
                        </p>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {money(paid)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/60 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Left
                        </p>
                        <p className="text-sm font-semibold">
                          {money(outstanding)}
                        </p>
                      </div>
                    </div>

                    <Progress value={pct} className="mt-3 h-1.5" />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">
                        {schedule.length > 1
                          ? `${paidCount}/${schedule.length} payments done`
                          : `${Math.round(pct)}% paid`}
                      </p>
                      <Button variant="outline" size="sm" className="h-8" asChild>
                        <Link to={`/dues/${due.id}`}>Open</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <DueForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        due={editing}
        onSubmit={handleSubmit}
      />
    </DashboardLayout>
  );
}
