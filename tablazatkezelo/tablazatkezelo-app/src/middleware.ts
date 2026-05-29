// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token");
  const { pathname } = request.nextUrl;

  const protectedRoutes = ["/dashboard", "/sheet"];
  const authRoutes = ["/login", "/register"];

  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));
  const isAuthRoute = authRoutes.some((r) => pathname.startsWith(r));

  // HOZZÁADVA a /tablazatkezelo előtag az URL építéshez
  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/tablazatkezelo/login", request.url));
  }

  // HOZZÁADVA a /tablazatkezelo előtag az URL építéshez
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/tablazatkezelo/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // A matcher marad ugyanaz, a Next.js ezt okosan lekezeli a basePath ismeretében
  matcher: ["/dashboard/:path*", "/sheet/:path*", "/login", "/register"],
};