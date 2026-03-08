import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

  try {
    // Parse using a dummy origin to handle relative URLs natively
    const parsed = new URL(url.trim(), "http://dummy.local");

    // Only allow safe protocols
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      // If the origin is our dummy local origin, it was a relative URL!
      if (parsed.hostname === "dummy.local") {
        // Return only the path and query string (reconstructed, so taint is dropped!)
        return parsed.pathname + parsed.search + parsed.hash;
      }

      // Otherwise, it was an absolute URL with http/https
      return parsed.href;
    }
  } catch (e) {
    // URL was completely unparsable
  }

  return "";
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
