import type { Debt } from "@/hooks/useDebts";

const pad = (value: number) => String(value).padStart(2, "0");

export function monthlyScheduleDate(anchor: string, monthOffset: number) {
  const [year, month, day] = anchor.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(monthOffset)) return "";

  const targetMonth = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const targetYear = targetMonth.getUTCFullYear();
  const targetMonthNumber = targetMonth.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthNumber, 0)).getUTCDate();

  return `${targetYear}-${pad(targetMonthNumber)}-${pad(Math.min(day, lastDay))}`;
}

export type DebtDueState = {
  kind: "upcoming" | "due" | "overdue";
  dueDate: string;
  daysOverdue: number;
};

export function getDebtDueState(
  debt: Pick<Debt, "debt_type" | "due_date" | "installments" | "remaining_amount" | "status">,
  today: string,
): DebtDueState | null {
  if (
    debt.remaining_amount <= 0 ||
    ["paid", "rejected", "cancelled"].includes(debt.status)
  ) {
    return null;
  }

  const unpaidInstallments = debt.installments
    .filter((installment) => installment.remaining_amount > 0)
    .sort((a, b) => a.installment_number - b.installment_number);
  const rawDueDate =
    debt.debt_type === "one_time"
      ? debt.due_date
      : unpaidInstallments.find((installment) => installment.due_date.slice(0, 10) <= today)?.due_date ??
        unpaidInstallments[0]?.due_date;
  if (!rawDueDate) return null;

  const dueDate = rawDueDate.slice(0, 10);
  if (dueDate > today) return { kind: "upcoming", dueDate, daysOverdue: 0 };
  if (dueDate === today) return { kind: "due", dueDate, daysOverdue: 0 };

  const dueDay = new Date(`${dueDate}T00:00:00Z`).getTime();
  const todayDay = new Date(`${today}T00:00:00Z`).getTime();
  const daysOverdue = Math.max(1, Math.floor((todayDay - dueDay) / 86_400_000));
  return { kind: "overdue", dueDate, daysOverdue };
}