import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type DueFrequency = "one-time" | "installment" | "emi";
export type DueRole = "editor" | "viewer";

export interface DuePerson {
  id: string;
  email: string;
  role: DueRole;
}

export interface DuePayment {
  id: string;
  amount: number;
  notes?: string;
  date: string;
}

export interface EmiDetails {
  productPrice: number;
  processingFeePercent: number;
  gstPercent: number;
  processingFeeAmount: number;
  gstOnProcessing: number;
  interestRate: number;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  gstOnInterest: number;
  totalPayable: number;
}

export interface DueEntry {
  id: string;
  title: string;
  totalAmount: number;
  dueDate: string;
  frequency: DueFrequency;
  notes?: string;
  createdAt: string;
  payments: DuePayment[];
  people: DuePerson[];
  emiDetails?: EmiDetails;
}

const STORAGE_KEY = "bookish-dues";
const STORAGE_EVENT = "bookish-dues-updated";

function generateId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function parseStoredDues(): DueEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<DueEntry>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: typeof item.id === "string" ? item.id : generateId(),
      title: typeof item.title === "string" ? item.title : String(item.title ?? ""),
      totalAmount: Number(item.totalAmount ?? 0),
      dueDate: typeof item.dueDate === "string" ? item.dueDate : String(item.dueDate ?? ""),
      frequency:
        item.frequency === "one-time" || item.frequency === "installment" || item.frequency === "emi"
          ? item.frequency
          : "one-time",
      notes: typeof item.notes === "string" ? item.notes : undefined,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      payments: Array.isArray(item.payments) ? item.payments.filter(Boolean) : [],
      people: Array.isArray(item.people) ? item.people.filter(Boolean) : [],
      emiDetails: typeof item.emiDetails === "object" && item.emiDetails !== null ? item.emiDetails : undefined,
    }));
  } catch {
    return [];
  }
}

function formatAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function calculateEmiDetails(
  productPrice: number,
  processingFeePercent: number,
  interestRate: number,
  tenureMonths: number,
  gstPercent = 18,
): EmiDetails {
  const processingFeeAmount = productPrice * (processingFeePercent / 100);
  const gstOnProcessing = processingFeeAmount * (gstPercent / 100);
  const principal = productPrice;
  const monthlyRate = interestRate / 12 / 100;
  const months = Math.max(1, Math.round(tenureMonths));
  const monthlyEmi = monthlyRate > 0
    ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months))
    : principal / months;
  const totalInterest = monthlyEmi * months - principal;
  const gstOnInterest = totalInterest * (gstPercent / 100);
  const totalPayable =
    principal +
    processingFeeAmount +
    gstOnProcessing +
    totalInterest +
    gstOnInterest;

  return {
    productPrice: principal,
    processingFeePercent,
    gstPercent,
    processingFeeAmount,
    gstOnProcessing,
    interestRate,
    tenureMonths: months,
    monthlyEmi,
    totalInterest,
    gstOnInterest,
    totalPayable,
  };
}

export function getTotalPaid(due: DueEntry) {
  return due.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function useDues() {
  const [dues, setDues] = useState<DueEntry[]>(() => parseStoredDues());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = () => setDues(parseStoredDues());
    window.addEventListener(STORAGE_EVENT, listener);
    return () => window.removeEventListener(STORAGE_EVENT, listener);
  }, []);

  const totals = useMemo(() => {
    const total = dues.reduce((sum, due) => sum + due.totalAmount, 0);
    const paid = dues.reduce((sum, due) => sum + getTotalPaid(due), 0);
    const outstanding = total - paid;
    const count = dues.length;
    const pendingCount = dues.filter((due) => due.totalAmount > getTotalPaid(due)).length;
    return { total, paid, outstanding, count, pendingCount };
  }, [dues]);

  const addDue = useCallback(
    (payload: Omit<DueEntry, "id" | "createdAt" | "payments" | "people">) => {
      const due: DueEntry = {
        ...payload,
        id: generateId(),
        createdAt: new Date().toISOString(),
        payments: [],
        people: [],
      };
      setDues((current) => {
        const next = [due, ...current];
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          window.dispatchEvent(new Event(STORAGE_EVENT));
        }
        return next;
      });
      toast.success("Due added");
    },
    [],
  );

  const deleteDue = useCallback((dueId: string) => {
    setDues((current) => {
      const next = current.filter((due) => due.id !== dueId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STORAGE_EVENT));
      }
      return next;
    });
    toast("Due removed");
  }, []);

  const addPayment = useCallback((dueId: string, amount: number, notes?: string) => {
    setDues((current) => {
      const next = current.map((due) => {
        if (due.id !== dueId) return due;
        const payment: DuePayment = {
          id: generateId(),
          amount: formatAmount(amount),
          notes: notes?.trim() || undefined,
          date: new Date().toISOString(),
        };
        return { ...due, payments: [...due.payments, payment] };
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STORAGE_EVENT));
      }
      return next;
    });
    toast.success("Payment recorded");
  }, []);

  const deletePayment = useCallback((dueId: string, paymentId: string) => {
    setDues((current) => {
      const next = current.map((due) => {
        if (due.id !== dueId) return due;
        return {
          ...due,
          payments: due.payments.filter((payment) => payment.id !== paymentId),
        };
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STORAGE_EVENT));
      }
      return next;
    });
    toast("Payment removed");
  }, []);

  const addPerson = useCallback((dueId: string, email: string, role: DueRole) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Email is required");
      return;
    }
    setDues((current) => {
      const next = current.map((due) => {
        if (due.id !== dueId) return due;
        if (due.people.some((person) => person.email === normalizedEmail)) {
          toast.error("Person already invited");
          return due;
        }
        return {
          ...due,
          people: [
            ...due.people,
            { id: generateId(), email: normalizedEmail, role },
          ],
        };
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STORAGE_EVENT));
      }
      return next;
    });
    toast.success("Person invited");
  }, []);

  const removePerson = useCallback((dueId: string, personId: string) => {
    setDues((current) => {
      const next = current.map((due) => {
        if (due.id !== dueId) return due;
        return {
          ...due,
          people: due.people.filter((person) => person.id !== personId),
        };
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STORAGE_EVENT));
      }
      return next;
    });
    toast("Person removed");
  }, []);

  const updatePersonRole = useCallback(
    (dueId: string, personId: string, role: DueRole) => {
      setDues((current) => {
        const next = current.map((due) => {
          if (due.id !== dueId) return due;
          return {
            ...due,
            people: due.people.map((person) =>
              person.id === personId ? { ...person, role } : person,
            ),
          };
        });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          window.dispatchEvent(new Event(STORAGE_EVENT));
        }
        return next;
      });
      toast("Person role updated");
    },
    [],
  );

  const getDueById = useCallback(
    (dueId: string) => dues.find((due) => due.id === dueId) ?? null,
    [dues],
  );

  const clearDues = useCallback(() => {
    const next: DueEntry[] = [];
    setDues(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
    toast("All dues cleared");
  }, []);

  return {
    dues,
    totals,
    addDue,
    deleteDue,
    addPayment,
    deletePayment,
    addPerson,
    removePerson,
    updatePersonRole,
    clearDues,
    getDueById,
  };
}
