import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { sanitizeUrl as braintreeSanitizeUrl } from "@braintree/sanitize-url";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";

  const d = typeof date === "string" ? new Date(date) : date;

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return "Invalid date";
  }

  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function generateSlugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  const sanitized = braintreeSanitizeUrl(url);
  return sanitized === "about:blank" ? "" : sanitized;
}

/**
 * Sanitizes text content to prevent XSS when being inserted into the DOM.
 * Escapes HTML meta-characters like <, >, &, ", and '.
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
