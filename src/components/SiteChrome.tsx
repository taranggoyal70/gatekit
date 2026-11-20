import Link from "next/link";

/** Header shared by the public pages (landing and docs). */
export function SiteHeader() {
  return (
    <header className="gate-header">
      <div className="gate-header-inner">
        <Link href="/" className="gate-brand">
          <span>G/</span>
          <strong>Gatekit</strong>
        </Link>
        <nav>
          <Link href="/docs">Documentation</Link>
          <a href="https://github.com/taranggoyal70/gatekit" target="_blank" rel="noreferrer">GitHub ↗</a>
          <Link href="/sign-up" className="gate-nav-cta">Open console</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="gate-footer">
      <strong>Gatekit</strong>
      <span>Governance for agents that do more than chat.</span>
      <a href="https://github.com/taranggoyal70/gatekit" target="_blank" rel="noreferrer">View source ↗</a>
    </footer>
  );
}
