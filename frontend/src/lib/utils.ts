import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 2 } = options ?? {};
  if (compact && Math.abs(value) >= 1000) {
    const units = ["", "K", "M", "B"];
    const i = Math.floor(Math.log10(Math.abs(value)) / 3);
    const v = value / Math.pow(1000, i);
    return `$${v.toFixed(1)}${units[i]}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(value);
}

export function getPriorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "medium": return "text-yellow-400";
    case "low": return "text-green-400";
    default: return "text-muted-foreground";
  }
}

export function getPriorityBadgeClass(priority: string): string {
  switch (priority.toLowerCase()) {
    case "critical": return "priority-critical";
    case "high": return "priority-high";
    case "medium": return "priority-medium";
    case "low": return "priority-low";
    default: return "";
  }
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return "text-green-400";
  if (confidence >= 70) return "text-yellow-400";
  return "text-orange-400";
}

export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}
