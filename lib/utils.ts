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

  return d.toLocaleDateString("en-US", {
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
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();

  // List of dangerous protocols to block
  const dangerousProtocols = /^(javascript|data|vbscript|file|blob):/i;

  // Check raw input for dangerous protocols
  if (dangerousProtocols.test(trimmed)) {
    return "";
  }

  // Allow http/https and relative paths only
  // Matches:
  // 1. / (absolute path)
  // 2. ./ or ../ (relative path)
  // 3. http:// or https:// (absolute URL)
  const safePattern = /^(\/|\.\/|\.\.\/|https?:\/\/)/i;

  if (safePattern.test(trimmed)) {
    try {
      // Decode URL and re-check for encoded dangerous protocols
      // e.g., "javascript%3A" would decode to "javascript:"
      const decoded = decodeURIComponent(trimmed);
      if (dangerousProtocols.test(decoded)) {
        return "";
      }
    } catch {
      // decodeURIComponent can throw on malformed URLs - still safe since we validated protocol
    }
    return trimmed;
  }

  return "";
}
