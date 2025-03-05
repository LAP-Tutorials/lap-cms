import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This is a simple example that checks if the user is trying to access /admin
// Without a real session or token, we can't verify on the server easily.
export function middleware(request: NextRequest) {
  // If you want a simple check for the path:
  if (request.nextUrl.pathname.startsWith("/admin")) {
    // In a real app, you'd check for a valid token or session cookie.
    // We can do a naive check for now:
    const token = request.cookies.get("token"); // or some approach
    if (!token) {
      // redirect to login
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return NextResponse.next();
}

// optionally define config for the matcher
export const config = {
  matcher: ["/admin/:path*"],
};
