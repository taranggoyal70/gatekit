import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, siteUrl } from "@/lib/site";
import "./globals.css";

const title = `${SITE_NAME} — ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE_DESCRIPTION,
  },
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
