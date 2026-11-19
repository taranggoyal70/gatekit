import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";

const clerkAppearance = {
  variables: {
    colorPrimary: "#ff5a36",
    colorText: "#111714",
    colorTextSecondary: "#65706a",
    colorBackground: "#f7f8f4",
    colorInputBackground: "#ffffff",
    colorInputText: "#111714",
    borderRadius: "6px",
    fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
  },
  elements: {
    rootBox: "gate-auth-clerk-root",
    cardBox: "gate-auth-clerk-box",
    card: "gate-auth-clerk-card",
    headerTitle: "gate-auth-clerk-title",
    headerSubtitle: "gate-auth-clerk-subtitle",
    socialButtonsBlockButton: "gate-auth-social-button",
    formButtonPrimary: "gate-auth-primary-button",
    formFieldInput: "gate-auth-input",
    footer: "gate-auth-clerk-footer",
  },
} as const;

export function AuthExperience({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";

  return (
    <main className="gate-auth-shell">
      <section className="gate-auth-story" aria-labelledby="gate-auth-heading">
        <Link href="/" className="gate-auth-brand" aria-label="Gatekit home">
          <span>G/</span>
          <strong>Gatekit</strong>
        </Link>

        <div className="gate-auth-story-copy">
          <p className="gate-auth-eyebrow"><span /> Runtime governance for agents</p>
          <h1 id="gate-auth-heading">
            Give every action<br />
            <em>a decision boundary.</em>
          </h1>
          <p>
            Evaluate intent, enforce policy, and route high-risk actions to the
            right human before an agent touches production.
          </p>
        </div>

        <div className="gate-auth-trace" aria-label="Example live policy trace">
          <div className="gate-auth-trace-head">
            <span><i /> Live trace</span>
            <code>trace_18A7</code>
          </div>
          <div className="gate-auth-trace-row">
            <span>01</span><strong>payment.refund</strong><code>$2,400</code>
          </div>
          <div className="gate-auth-trace-row">
            <span>02</span><strong>finance_approval</strong><code>matched</code>
          </div>
          <div className="gate-auth-trace-decision">
            <small>Decision</small><strong>Approval required</strong><span>20ms</span>
          </div>
        </div>

        <p className="gate-auth-footnote">AgentRogue Hackathon 2026 winner · Policy-first by design</p>
      </section>

      <section className="gate-auth-form-panel" aria-label={isSignUp ? "Create your Gatekit account" : "Sign in to Gatekit"}>
        <div className="gate-auth-mobile-brand">
          <Link href="/"><span>G/</span><strong>Gatekit</strong></Link>
        </div>
        {isSignUp ? (
          <SignUp appearance={clerkAppearance} />
        ) : (
          <SignIn appearance={clerkAppearance} />
        )}
        <Link href="/" className="gate-auth-back">← Return to product overview</Link>
      </section>
    </main>
  );
}
