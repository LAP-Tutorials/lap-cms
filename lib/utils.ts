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

  // Fast path for safe URLs to preserve encoding (like Firebase %2F)
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/")
  ) {
    return url;
  }

  const sanitized = braintreeSanitizeUrl(url);
  return sanitized === "about:blank" ? "" : sanitized;
}

export function sanitizeHttpsHref(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "https:" && parsed.username === "" && parsed.password === "") {
      return parsed.toString().slice(0, 1000);
    }
  } catch {
    // Invalid and non-HTTPS links are omitted.
  }
  return "";
}

export function sanitizeSocialMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    const key = rawKey.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(key) || typeof rawValue !== "string") continue;
    const href = sanitizeHttpsHref(rawValue);
    if (href) result[key] = href;
  }
  return result;
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
