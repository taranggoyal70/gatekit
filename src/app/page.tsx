import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
            Gatekit
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/docs" className="text-[var(--foreground)]/60 hover:text-[var(--foreground)]">
              Docs
            </Link>
            <Link href="/sign-in" className="text-[var(--foreground)]/60 hover:text-[var(--foreground)]">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[#04141a]"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="py-24 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Governance for AI agents
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Your agents are about to send that email.
            <br />
            Are you sure you want them to?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-[var(--foreground)]/60">
            Gatekit sits between your AI agents and the outside world. One line of
            code wraps every risky action in a policy check — allow it, block it,
            or hold it for a human, before it ever executes.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-xl bg-[var(--accent)] px-6 py-3 font-medium text-[#04141a]"
            >
              Start free
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-[var(--line)] px-6 py-3 font-medium"
            >
              Read the docs
            </Link>
          </div>
        </section>

        <section className="pb-24">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="mb-3 text-xs uppercase tracking-wide text-[var(--foreground)]/40">
              What one guard() call does
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[var(--background)] p-4 text-sm leading-6">
{`import { GatekitClient } from "@gatekit/sdk";

const gatekit = new GatekitClient({ apiKey: process.env.GATEKIT_KEY! });

// Wraps ANY outbound action your agent takes.
await gatekit.guard(
  { actionType: "payment.refund", target: customerId, riskLevel: "high" },
  () => stripe.refunds.create({ payment_intent: paymentId }),
);

// -> allowed by policy: executes immediately
// -> denied by policy: throws, refund never fires
// -> held for approval: waits for a human, then executes or throws`}
            </pre>
          </div>
        </section>

        <section className="grid gap-6 pb-24 sm:grid-cols-3">
          <Feature
            title="Policy engine"
            body="Rule-based, priority-ordered, auditable. Match on action type, target, and risk level — no black-box ML deciding what your agent can do."
          />
          <Feature
            title="Human-in-the-loop"
            body="Risky actions pause and notify your team. Approve or deny from the dashboard, with a reason that lands in the audit trail."
          />
          <Feature
            title="Immutable audit log"
            body="Every action, decision, and override — logged forever. The record compliance and security teams ask for, without building it yourself."
          />
        </section>
      </main>

      <footer className="border-t border-[var(--line)] py-8 text-center text-sm text-[var(--foreground)]/40">
        Gatekit — the governance layer for AI agents taking real-world actions.
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--foreground)]/60">{body}</p>
    </div>
  );
}
