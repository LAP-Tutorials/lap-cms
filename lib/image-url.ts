/** Allow web images and local paths without decoding Firebase object names. */
export function sanitizeImageUrl(value: string | null | undefined): string {
  if (!value) return "";

  try {
    const url = new URL(value.trim(), "https://lap-image.invalid");
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";

    // Keep local paths relative to the application, including their query string.
    if (url.origin === "https://lap-image.invalid") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.href;
  } catch {
    return "";
  }
}
