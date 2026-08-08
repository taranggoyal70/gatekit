import pkg from "../../package.json";

/**
 * Single source of truth for the site's public identity.
 * Reused by the root metadata, the Open Graph image, and any link-unfurling
 * surface — so the share thumbnail can never drift from the page title.
 */

// Derive the display name from package.json ("gatekit" -> "Gatekit").
export const SITE_NAME = pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1);

export const SITE_TAGLINE = "Governance layer for AI agents";

export const SITE_DESCRIPTION =
  `${SITE_NAME} sits between your AI agents and the outside world: policy ` +
  "gates, human approvals, and an immutable audit log for every action an " +
  "agent takes.";

/**
 * Absolute base URL used for canonical + Open Graph URLs. Prefers the app's
 * own convention (NEXT_PUBLIC_SITE_URL), then Vercel's injected production/
 * deploy URLs, then localhost for dev. Never hardcoded to a single domain.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;

  const vercelDeploy = process.env.VERCEL_URL;
  if (vercelDeploy) return `https://${vercelDeploy}`;

  return "http://localhost:3000";
}
