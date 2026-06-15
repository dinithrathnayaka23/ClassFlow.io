import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const match = path.match(/^\/(admin|teacher|student)(\/|$)/);
  if (!match) return NextResponse.next();
  const token = request.cookies.get("classflow_token")?.value;
  const role = request.cookies.get("classflow_role")?.value;
  if (!token) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, request.url));
  if (role && role !== match[1]) return NextResponse.redirect(new URL(`/${role}/dashboard`, request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*"] };
