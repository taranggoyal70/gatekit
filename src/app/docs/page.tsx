import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs | Gatekit",
  description:
    "Gatekit reference: install the SDK, guard an action, write policy rules, call the REST API and verify the audit log.",
};

const SECTIONS = [
  ["install", "Install"],
  ["quick-start", "Quick start"],
  ["evaluate", "evaluate()"],
  ["policies", "Policy rules"],
  ["rest", "REST API"],
  ["audit", "Audit log"],
  ["limits", "Limits and errors"],
] as const;

export default function DocsPage() {
  const base = siteUrl();
  return (
    <div className="gate-site">
      <SiteHeader />

      <div className="gate-docs">
        <aside className="gate-docs-nav" aria-label="On this page">
          <p>On this page</p>
          <nav>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="gate-docs-main">
          <p className="gate-kicker">
            <span /> DOCUMENTATION
          </p>
          <h1>Put a gate in front of every action.</h1>
          <p className="gate-docs-lede">
            One call per outbound action. Gatekit allows it, denies it, or holds it for a person,
            and records the decision in a hash-chained audit log you can verify.
          </p>

          <Section id="install" title="Install">
            <p>
              <code>@gatekit/sdk</code> is not on npm yet. Build it from the repository and install
              the tarball, or call the REST API below from any language.
            </p>
            <Code label="terminal">{`git clone https://github.com/taranggoyal70/gatekit.git
cd gatekit && pnpm install
cd packages/sdk && npx tsc -p . && npm pack
# in your agent's project:
npm install /path/to/gatekit/packages/sdk/gatekit-sdk-0.1.0.tgz`}</Code>
          </Section>

          <Section id="quick-start" title="Quick start">
            <p>Create an agent key under Agents in the console (it is shown once), then wrap the call:</p>
            <Code label="agent.ts">{`import { GatekitClient } from "@gatekit/sdk";

const gatekit = new GatekitClient({
  apiKey: process.env.GATEKIT_KEY!,
  baseUrl: "${base}",
});

await gatekit.guard(
  { actionType: "email.send", target: "user@example.com", riskLevel: "medium" },
  () => sendEmail(),
);`}</Code>
            <dl className="gate-docs-outcomes">
              <div>
                <dt>allow</dt>
                <dd>Your function runs immediately and <code>guard()</code> returns its result.</dd>
              </div>
              <div>
                <dt>deny</dt>
                <dd>
                  <code>guard()</code> throws <code>GatekitDeniedError</code>; your function never runs.
                </dd>
              </div>
              <div>
                <dt>require_approval</dt>
                <dd>
                  It polls until a person decides (up to 10 minutes by default), then runs your
                  function or throws with <code>reason</code> <code>approval_denied</code>,{" "}
                  <code>approval_expired</code> or <code>timeout</code>.
                </dd>
              </div>
            </dl>
          </Section>

          <Section id="evaluate" title="evaluate(input)">
            <p>
              The lower-level call, for when you want to handle the decision yourself instead of
              using <code>guard()</code>.
            </p>
            <Code label="agent.ts">{`const result = await gatekit.evaluate({
  actionType: "payment.refund",
  target: customerId,
  riskLevel: "high",
  context: { amountCents: 4200 }, // optional, shown to approvers
});

// result.decision: "allow" | "deny" | "require_approval"
// result.status:   "resolved" | "pending"
// result.actionId: pass to waitForApproval() or getActionStatus()`}</Code>
          </Section>

          <Section id="policies" title="Policy rules">
            <p>
              Policies are checked in priority order, lowest number first. The first enabled policy
              whose action type pattern, target pattern and minimum risk level all match decides.
              In patterns, <code>*</code> matches any run of characters and everything else is
              literal: <code>email.*</code> matches <code>email.send</code>, and{" "}
              <code>*@external.com</code> matches any address at that domain. Matching ignores
              case, so <code>prod.*</code> also catches <code>Prod.orders</code>.
            </p>
            <p>
              If nothing matches, <code>high</code> and <code>critical</code> actions are held for
              a person and lower risks are allowed, so a new organization is protected before it
              writes a single rule.
            </p>
            <p>
              Risk levels come from the agent. Write deny and hold rules on action type and target
              wherever the rule does not truly depend on risk, so an agent that under-reports risk
              cannot slip past them. Only admins and owners can create, change or delete policies,
              and every change is recorded in the audit log with who made it.
            </p>
          </Section>

          <Section id="rest" title="REST API">
            <p>The SDK is a thin wrapper over one endpoint, so any language can call it.</p>
            <Code label="terminal">{`curl -X POST ${base}/api/v1/evaluate \\
  -H "Authorization: Bearer $GATEKIT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"actionType":"email.send","target":"user@example.com","riskLevel":"low"}'`}</Code>
            <p>
              Poll a held action with <code>{"GET /api/v1/actions/{actionId}"}</code> using the
              same key.
            </p>
          </Section>

          <Section id="audit" title="Audit log">
            <p>
              Every evaluation, approval, expiry and policy change is appended to a per-organization
              SHA-256 hash chain in the same transaction as the change. The database refuses edits
              and deletes. Open Audit log in the console, or call{" "}
              <code>GET /api/audit/verify</code> while signed in, to recompute every hash and
              cross-check the actions table.
            </p>
            <p>
              Store the returned head somewhere Gatekit cannot reach and pass it back as{" "}
              <code>checkpointSeq</code> and <code>checkpointHash</code> to also catch dropped or
              rewritten events. When the deployment has a signing key, the response includes a{" "}
              <code>signedCheckpoint</code>. Anyone can check it offline against the public key at{" "}
              <code>{`${base}/api/audit/public-key`}</code>, for example with the script in a
              checkout of the repository:
            </p>
            <Code label="terminal">{`curl -s ${base}/api/audit/public-key | jq -r .publicKey > gatekit.pem
pnpm audit:verify-checkpoint checkpoint.json gatekit.pem`}</Code>
          </Section>

          <Section id="limits" title="Limits and errors">
            <ul>
              <li>
                <code>/api/v1/evaluate</code> allows 120 requests a minute per agent key, counted
                across all server instances. Over the limit it returns <code>429</code> with{" "}
                <code>Retry-After</code>.
              </li>
              <li>Request bodies are capped at 20 KB for evaluate.</li>
              <li>
                Errors are JSON: <code>{`{ "error": { "message", "code" } }`}</code>. The SDK
                raises them as <code>GatekitApiError</code>.
              </li>
              <li>Held actions expire after 24 hours if nobody decides.</li>
            </ul>
          </Section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="gate-docs-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="gate-docs-code">
      <div className="gate-code-bar">
        <span>{label}</span>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
