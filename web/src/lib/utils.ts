import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "날짜 미상";
  const date = new Date(dateString);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getDecisionLabel(decision: string): string {
  const labels: Record<string, string> = {
    must_read: "필독",
    should_read: "권장",
    maybe_read: "선택",
    skip: "건너뛰기",
  };
  return labels[decision] || decision;
}

export function getDecisionColor(decision: string): string {
  const colors: Record<string, string> = {
    must_read: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    should_read: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    maybe_read: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    skip: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  };
  return colors[decision] || "";
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}
