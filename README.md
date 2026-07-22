# Gatekit

The governance and audit layer for AI agents taking real-world actions.

AI agents now send emails, write to CRMs, issue refunds, and modify
databases in production. Gatekit sits between an agent and the outside
world: one SDK call wraps any outbound action, a policy engine decides
allow / deny / hold-for-approval *before* it executes, and every decision
is recorded in an immutable audit log.

## Why this exists

Observability tools (Langfuse, Braintrust, Arize) trace what an agent did
*after* the fact. Nobody sits in front of the action and blocks it before it
fires. Gatekit is that gate — the thing a security or compliance team
actually needs before they'll sign off on agents touching production
systems.

## Architecture

- **Next.js 16 (App Router) + TypeScript** — dashboard and API
- **Postgres + Drizzle ORM** — organizations, members, invites, agents, policies, actions, approvals, subscriptions
- **Clerk** — dashboard authentication (human users)
- **Agent API keys** — SHA-256-hashed, separate auth path for SDK/agent traffic
- **`@gatekit/sdk`** (`packages/sdk`) — the TypeScript client agents import
- **Resend** — approval-request and invite email notifications (optional)
- **Slack** — approval notifications via a per-org incoming webhook (optional)
- **Stripe** — Pro-tier billing: checkout, customer portal, and webhook-driven plan sync (optional)

### Teams and plans

An organization can have multiple members with a role (`owner`/`admin`/`member`);
owners and admins can invite by email, change roles, and remove members —
every organization must always keep at least one owner. Plan limits (agent
count, member count) are read from `organizations.planTier`, which Stripe's
webhook keeps in sync with the actual subscription (see
`src/lib/services/billing.ts` and `src/lib/plan-limits.ts`).

### Policy engine

The core logic (`src/lib/policy-engine.ts`) is a pure, dependency-free
function: given an action request and a list of policies, it returns a
decision. Policies are evaluated in ascending priority order; the first
enabled policy whose action-type pattern, target pattern, and risk
threshold all match wins. With no matching policy, low/medium-risk actions
are allowed and high/critical-risk actions are held for approval by
default — an org gets meaningful protection before configuring anything.

## Local setup

Requirements: Node.js 20+, pnpm, a Postgres database (local or hosted), a
Clerk application.

```bash
pnpm install
cp .env.example .env.local   # fill in Clerk keys + DATABASE_URL
pnpm db:migrate
pnpm dev
```

## Testing

```bash
pnpm test              # unit tests (no DB required)
pnpm typecheck
pnpm lint
```

Integration tests exercise the services layer against a real Postgres
(SQL correctness — constraints, cascades, transactions — isn't something a
mocked query builder can catch). They're skipped automatically unless
`TEST_DATABASE_URL` is set:

```bash
docker run -d --name gatekit-test-pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=gatekit_test -p 55432:5432 postgres:16-alpine

DATABASE_URL="postgres://postgres:test@localhost:55432/gatekit_test" pnpm db:migrate
TEST_DATABASE_URL="postgres://postgres:test@localhost:55432/gatekit_test" pnpm test
```

## SDK

```bash
npm install @gatekit/sdk
```

```ts
import { GatekitClient } from "@gatekit/sdk";

const gatekit = new GatekitClient({ apiKey: process.env.GATEKIT_KEY! });

// Wraps ANY outbound action your agent takes.
await gatekit.guard(
  { actionType: "payment.refund", target: customerId, riskLevel: "high" },
  () => stripe.refunds.create({ payment_intent: paymentId }),
);
```

`guard()` evaluates the action, then:
- **allow** → runs your function immediately.
- **deny** → throws `GatekitDeniedError`, your function never runs.
- **require_approval** → polls until a human decides, then runs your
  function or throws.

See `/docs` in the running app for the full API reference.

## Project layout

```
src/
  app/                 Next.js routes: dashboard pages + API routes
  components/           Dashboard UI
  db/                    Drizzle schema + migrations
  lib/
    policy-engine.ts     Core rule-evaluation logic (pure, heavily tested)
    plan-limits.ts        Free/Pro/Enterprise agent + member limits
    stripe.ts             Stripe client
    slack.ts              Slack webhook senders (approval notification + test message)
    services/            Business logic used by API routes (agents, policies, actions,
                          approvals, team, invites, billing, notification-settings)
    auth.ts               Clerk user + org-context + role-gated guard helpers
    agent-auth.ts          Agent API-key authentication
packages/sdk/            @gatekit/sdk — published TypeScript client
```

## Environment variables

See `.env.example`. Only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, and `DATABASE_URL` are required to run the app.
`RESEND_API_KEY` and the `STRIPE_*` variables are optional — approval/invite
emails and the Pro upgrade flow degrade gracefully without them. Slack
notifications need no environment variable at all: each organization
configures its own webhook URL from **Settings → Notifications**.
