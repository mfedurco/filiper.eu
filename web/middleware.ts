import { NextResponse, type NextRequest } from "next/server";

const SERVER_COOKIE = "vyprava_server";

export function middleware(request: NextRequest) {
  const fromQuery = request.nextUrl.searchParams.get("server")?.trim() ?? "";
  const fromCookie = request.cookies.get(SERVER_COOKIE)?.value?.trim() ?? "";
  const server = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(fromQuery)
    ? fromQuery
    : /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(fromCookie)
      ? fromCookie
      : "test";

  const headers = new Headers(request.headers);
  headers.set("x-vyprava-server", server);
  const response = NextResponse.next({ request: { headers } });
  if (fromQuery && fromQuery !== fromCookie) {
    response.cookies.set(SERVER_COOKIE, server, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|hlbina/).*)"],
};
