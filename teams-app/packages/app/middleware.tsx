import {
  getSessionCookieName,
  getSessionEndpoint,
} from "@fiftyone/teams-utilities";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const secret = process.env.FIFTYONE_AUTH_SECRET;
const key = new TextEncoder().encode(secret);

export async function middleware(request: NextRequest) {
  const cookieName = getSessionCookieName();
  const jwt = request.cookies.get(cookieName) as string;
  try {
    await jwtVerify(jwt, key, { requiredClaims: ["exp"] });
  } catch (e) {
    const { pathname, search } = request.nextUrl;
    const dest = getSessionEndpoint(pathname + search);
    return NextResponse.redirect(new URL(dest, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher:
    "/((?!cas|api/hello|_next/static|_next/image|favicon.ico|sign-out|api/auth/login).*)",
};
