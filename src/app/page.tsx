import Link from "next/link";
import { LandingDecisionConsole } from "@/components/LandingDecisionConsole";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { siteUrl } from "@/lib/site";

export default function LandingPage() {
  return (
    <div className="gate-site">
      <SiteHeader />

      <main>
        <section className="gate-hero">
          <div className="gate-hero-copy">
            <p className="gate-kicker"><span /> AGENTROGUE HACKATHON 2026 WINNER</p>
            <h1>Agents move fast.<br /><em>Gatekit decides faster.</em></h1>
            <p className="gate-hero-description">
              A control layer between AI agents and real-world actions. Every call is
              checked, explained, and either allowed, blocked, or sent to a human.
            </p>
            <div className="gate-actions">
              <Link href="/sign-up">Start governing →</Link>
              <Link href="/docs">Read the SDK docs</Link>
            </div>
            <div className="gate-proof">
              <div><strong>3</strong><span>deterministic decisions</span></div>
              <div><strong>1 line</strong><span>to guard any action</span></div>
              <div><strong>100%</strong><span>auditable outcomes</span></div>
            </div>
          </div>
          <LandingDecisionConsole />
        </section>

        <section className="gate-system">
          <div className="gate-section-title">
            <p>THE CONTROL PLANE</p>
            <h2>One boundary.<br />No silent side effects.</h2>
          </div>
          <div className="gate-feature-grid">
            <Feature number="01" title="Policy engine" body="Priority-ordered rules make every decision deterministic, inspectable, and easy to change." />
            <Feature number="02" title="Human approval" body="High-risk actions pause with full context, then resume only after an authorized decision." />
            <Feature number="03" title="Audit trail" body="Requests, policy matches, overrides, and final outcomes stay attached to one trace." />
          </div>
        </section>

        <section className="gate-sdk">
          <div className="gate-sdk-copy">
            <p>DROP-IN SDK</p>
            <h2>Wrap the action.<br />Keep your stack.</h2>
            <span>Gatekit does not replace your agent framework. It gives the action layer a hard, observable boundary.</span>
          </div>
          <div className="gate-code">
            <div className="gate-code-bar"><span>refund-agent.ts</span><code>TypeScript</code></div>
            <pre>
{`import { GatekitClient } from "@gatekithq/sdk";

const gatekit = new GatekitClient({
  apiKey: process.env.GATEKIT_KEY!,
  baseUrl: "${siteUrl()}",
});

await gatekit.guard(
  { actionType: "payment.refund", target: customerId, riskLevel: "high" },
  () => stripe.refunds.create({ payment_intent: paymentId }),
);`}
            </pre>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Feature({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="gate-feature">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
