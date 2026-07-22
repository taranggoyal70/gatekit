import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gatekit — Governance layer for AI agents",
  description:
    "Gatekit sits between your AI agents and the outside world: policy gates, human approvals, and an immutable audit log for every action an agent takes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
