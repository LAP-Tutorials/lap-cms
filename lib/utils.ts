import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A"

  const d = typeof date === "string" ? new Date(date) : date

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return "Invalid date"
  }

  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + "..."
}

export function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export function sanitizeUrl(url: string): string {
  if (!url) return ""
  const trimmed = url.trim()
  
  // Allow relative paths
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    return ["http:", "https:"].includes(parsed.protocol) ? trimmed : ""
  } catch {
    return ""
  }
}

