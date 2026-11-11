import { describe, expect, it } from "vitest";
import { getDebtDueState, monthlyScheduleDate } from "@/lib/debtSchedule";
import type { Debt } from "@/hooks/useDebts";

const scheduledDebt = (overrides: Partial<Debt> = {}): Debt => ({
  id: "debt-1",
  debt_type: "emi",
  status: "accepted",
  total_amount: 300,
  paid_amount: 0,
  remaining_amount: 300,
  description: "Monthly payment",
  currency: "INR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  due_date: "2026-01-31",
  installments: [
    {
      id: "inst-1",
      installment_number: 1,
      due_date: "2026-01-31",
      amount: 100,
      paid_amount: 0,
      remaining_amount: 100,
      status: "upcoming",
    },
  ],
  payments: [],
  activities: [],
  ...overrides,
});

describe("monthly debt schedule dates", () => {
  it("clamps end-of-month dates without drifting across subsequent months", () => {
    expect([0, 1, 2, 3].map((offset) => monthlyScheduleDate("2026-01-31", offset))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
});

describe("debt due warnings", () => {
  it("distinguishes future dates from due-today and overdue warnings", () => {
    const debt = scheduledDebt();
    expect(getDebtDueState(debt, "2026-01-30")?.kind).toBe("upcoming");
    expect(getDebtDueState(debt, "2026-01-31")?.kind).toBe("due");
    expect(getDebtDueState(debt, "2026-02-02")).toMatchObject({
      kind: "overdue",
      daysOverdue: 2,
    });
  });

  it("ignores paid installments and completed debts when choosing warnings", () => {
    const debt = scheduledDebt({
      installments: [
        {
          id: "inst-1",
          installment_number: 1,
          due_date: "2026-01-31",
          amount: 100,
          paid_amount: 100,
          remaining_amount: 0,
          status: "paid",
        },
        {
          id: "inst-2",
          installment_number: 2,
          due_date: "2026-02-28",
          amount: 100,
          paid_amount: 0,
          remaining_amount: 100,
          status: "upcoming",
        },
      ],
    });
    expect(getDebtDueState(debt, "2026-02-01")).toMatchObject({
      kind: "upcoming",
      dueDate: "2026-02-28",
    });
    expect(getDebtDueState(scheduledDebt({ status: "paid", remaining_amount: 0 }), "2026-02-02"))
      .toBeNull();
  });

  it("uses a one-time debt date when no installment schedule exists", () => {
    const debt = scheduledDebt({
      debt_type: "one_time",
      due_date: "2026-02-05",
      installments: [],
    });
    expect(getDebtDueState(debt, "2026-02-05")).toMatchObject({ kind: "due", dueDate: "2026-02-05" });
  });
});