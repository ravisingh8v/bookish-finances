import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number using the Indian numbering system (lakhs/crores)
 * with 2 decimal places. e.g. 100000 -> "1,00,000.00"
 */
export function formatINR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!isFinite(n)) return "0.00";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number using compact Indian units for dashboard-style summaries.
 * e.g. 125000 -> "1.3L", 12500000 -> "1.3Cr"
 */
export function formatCompactINR(
  value: number | string | null | undefined,
): string {
  const n = Number(value ?? 0);
  if (!isFinite(n)) return "0";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  const units = [
    { value: 1e11, suffix: "Kharab" },
    { value: 1e9, suffix: "Arab" },
    { value: 1e7, suffix: "Cr" },
    { value: 1e5, suffix: "L" },
  ];

  for (const unit of units) {
    if (abs >= unit.value) {
      const compact = abs / unit.value;
      const digits = compact >= 100 ? 0 : compact >= 10 ? 1 : 1;
      const rounded = Number(compact.toFixed(digits));
      return `${sign}${rounded}${unit.suffix}`;
    }
  }

  return `${sign}${abs.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}
