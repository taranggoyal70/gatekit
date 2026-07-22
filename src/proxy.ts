import { clerkMiddleware } from "@clerk/nextjs/server";

const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/agents",
  "/policies",
  "/approvals",
  "/logs",
  "/settings",
  "/invite",
];
const PROTECTED_API_PREFIXES = [
  "/api/agents",
  "/api/policies",
  "/api/actions",
  "/api/approvals",
  "/api/team",
  "/api/invites",
  "/api/billing",
  "/api/settings",
];

// Stripe calls this directly with its own signature, not a Clerk session —
// it must stay reachable while every other /api/billing/* route requires
// sign-in.
const UNPROTECTED_EXACT_PATHS = new Set(["/api/billing/webhook"]);

export function isProtectedPagePathname(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProtectedApiPathname(pathname: string): boolean {
  if (UNPROTECTED_EXACT_PATHS.has(pathname)) return false;
  return PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  if (isProtectedPagePathname(pathname)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", request.url);
    await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
  } else if (isProtectedApiPathname(pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/__clerk(.*)",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
