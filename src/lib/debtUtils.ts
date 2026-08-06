import type { Debt } from "@/hooks/useDebts";

export const canRecordPayment = (debt: Debt) =>
  debt.remaining_amount > 0 &&
  !["pending", "rejected", "cancelled"].includes(debt.status);
