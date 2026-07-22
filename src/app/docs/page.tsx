import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — Gatekit",
  description: "Gatekit API reference: evaluate, guard, and the policy rule format.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
            Gatekit
          </Link>
          <Link href="/sign-up" className="text-sm font-medium text-[var(--accent)]">
            Get started →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>

        <Section title="Install">
          <Code>{`npm install @gatekit/sdk`}</Code>
        </Section>

        <Section title="Quick start">
          <p className="mb-3 text-sm text-[var(--foreground)]/70">
            Create an agent key from the dashboard, then wrap any outbound call your agent makes:
          </p>
          <Code>{`import { GatekitClient } from "@gatekit/sdk";

const gatekit = new GatekitClient({ apiKey: process.env.GATEKIT_KEY! });

const result = await gatekit.guard(
  { actionType: "email.send", target: "user@example.com", riskLevel: "medium" },
  () => sendEmail(),
);`}</Code>
          <p className="mt-3 text-sm text-[var(--foreground)]/70">
            <code>guard()</code> evaluates the action against your policies. If allowed, it runs
            your function immediately. If denied, it throws <code>GatekitDeniedError</code> without
            running it. If held for approval, it polls until a human decides, then runs your
            function or throws.
          </p>
        </Section>

        <Section title="evaluate(input)">
          <p className="mb-3 text-sm text-[var(--foreground)]/70">
            Lower-level primitive if you want to handle the decision yourself instead of using{" "}
            <code>guard()</code>.
          </p>
          <Code>{`const result = await gatekit.evaluate({
  actionType: "payment.refund",
  target: customerId,
  riskLevel: "high",
  context: { amountCents: 4200 }, // optional, shown to approvers
});

// result.decision: "allow" | "deny" | "require_approval"
// result.status:   "resolved" | "pending"
// result.actionId: use with waitForApproval() or getActionStatus()`}</Code>
        </Section>

        <Section title="Policy rules">
          <p className="mb-3 text-sm text-[var(--foreground)]/70">
            Policies are evaluated in priority order (lowest number first). The first enabled
            policy whose <code>actionTypePattern</code>, <code>targetPattern</code>, and{" "}
            <code>minRiskLevel</code> all match wins. Patterns support{" "}
            <code>*</code> as a wildcard — <code>email.*</code> matches{" "}
            <code>email.send</code>; <code>*@external.com</code> matches any address at that
            domain.
          </p>
          <p className="text-sm text-[var(--foreground)]/70">
            If nothing matches: low/medium-risk actions are allowed, high/critical-risk actions are
            held for approval. This keeps a new org safe by default without requiring any policy
            configuration on day one.
          </p>
        </Section>

        <Section title="REST API">
          <p className="mb-3 text-sm text-[var(--foreground)]/70">
            The SDK is a thin wrapper over this — call it directly from any language.
          </p>
          <Code>{`curl -X POST https://api.gatekit.dev/api/v1/evaluate \\
  -H "Authorization: Bearer gk_live_your_agent_key" \\
  -H "Content-Type: application/json" \\
  -d '{"actionType":"email.send","target":"user@example.com","riskLevel":"low"}'`}</Code>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6">
      {children}
    </pre>
  );
}
