import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeImageUrl } from "./image-url.ts";

test("blocks executable schemes, credentials, and malformed image URLs", () => {
  for (const input of [
    "javascript:alert(1)",
    " \tJaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml,<svg onload='alert(1)'/>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "https://user:password@example.com/avatar.png",
    "http://[",
  ]) {
    assert.equal(sanitizeImageUrl(input), "", input);
  }
  assert.equal(sanitizeImageUrl(null), "");
  assert.equal(sanitizeImageUrl(undefined), "");
  assert.equal(sanitizeImageUrl(""), "");
});

test("preserves encoded Firebase paths and image query parameters", () => {
  const firebase = "https://firebasestorage.googleapis.com/v0/b/example/o/team%2Favatar%20one.jpg?alt=media&token=abc%2Fdef";
  assert.equal(sanitizeImageUrl(firebase), firebase);
  assert.equal(sanitizeImageUrl(" https://lh3.googleusercontent.com/a/photo=s96-c "), "https://lh3.googleusercontent.com/a/photo=s96-c");
  assert.equal(sanitizeImageUrl("http://example.com/photo.jpg"), "http://example.com/photo.jpg");
  assert.equal(sanitizeImageUrl("/placeholder.svg?height=80&width=80"), "/placeholder.svg?height=80&width=80");
  assert.equal(sanitizeImageUrl("//example.com/photo.jpg"), "https://example.com/photo.jpg");
});
