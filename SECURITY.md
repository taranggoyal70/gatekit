# Security

Gatekit decides whether an AI agent's real-world action may run, and keeps
the record of that decision. A flaw here can let an action through that
should have been stopped, or let someone rewrite what happened. Please report
anything in that class privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository
(**Security → Report a vulnerability**). Do not open a public issue.

Include the affected route or module, a minimal reproduction, and what an
attacker gains. Remove real agent keys, Clerk or Stripe secrets, and customer
data before sending. You will get an acknowledgement within 3 working days.

## Supported versions

Only the `main` branch and the current deployment are supported.

## Trust boundaries

| Caller | Authenticates with | Can do |
| :--- | :--- | :--- |
| An agent process | `Authorization: Bearer gk_live_…` agent key | Evaluate actions for its own organization; read the status of its own organization's actions. Nothing else. |
| A dashboard user | Clerk session | Everything in their organization that their role allows. |
| Stripe | `stripe-signature` on `/api/billing/webhook` | Update the subscription record it signs for. |

- Agent keys are 40 random base62 characters (about 238 bits) behind a
  `gk_live_` prefix. Only the SHA-256 hash and an 14-character display prefix
  are stored; the key is shown once, at creation. A revoked key stops
  authenticating immediately; its history is kept.
- Every service query is scoped by the caller's organization id. Route ids
  are validated as UUIDs before they reach SQL.
- JSON bodies are capped on the bytes actually read (20 KB for
  `/api/v1/evaluate`, 64 KB elsewhere), not on `Content-Length`.
- `/api/v1/evaluate` is rate limited per agent (120 requests a minute). The
  limiter is in memory, so on several server instances each instance counts
  separately; see "Known limits".
- The Slack webhook field only accepts `https://hooks.slack.com/services/…`,
  so it cannot be used to make the server request arbitrary URLs.

## Audit log integrity

Every action evaluation, approval decision, approval expiry and policy change
is written to `audit_events` in the same transaction as the change itself.
Each event stores `prevHash` and
`hash = SHA-256(prevHash || "\n" || canonical JSON of the event)`, forming one
chain per organization ([`src/lib/audit-chain.ts`](src/lib/audit-chain.ts)).

What protects it:

1. **Prevention.** A trigger rejects `UPDATE` and direct `DELETE` on
   `audit_events`. Only deleting the whole organization removes its events.
2. **Detection.** `GET /api/audit/verify` (and the **Audit log** page)
   recomputes every hash, checks sequence continuity, and cross-checks the
   mutable `actions` table against the chain, so an edited decision or status
   there is reported.
3. **Checkpoints.** The verify response includes the chain head
   (`headSeq`, `headHash`). Store it somewhere Gatekit's database cannot reach
   (a ticket, a log pipeline, a signed commit) and pass it back as
   `checkpointSeq` / `checkpointHash`; verification then also catches the
   newest events being dropped, or the chain being rewritten and fully
   re-hashed after that point.

The [eval](eval/README.md) runs twelve tampering scenarios against these
guarantees on every CI run.

## Known limits

- **A database owner can defeat prevention.** Anyone who can disable the
  trigger or `TRUNCATE` the table can change events. They cannot do it
  without detection unless they also rewrite every later hash, and they
  cannot do that past a checkpoint you stored elsewhere. Without a stored
  checkpoint, dropping the newest events is not detectable from the database
  alone. Signing checkpoints with a key held outside the database (for
  example a KMS key) is the planned next step.
- **Risk levels come from the agent.** Policies can match on risk, and Gatekit
  trusts the agent's label. An agent that under-reports risk can get an action
  allowed that a higher label would have held. Write deny and hold rules on
  action type and target wherever the rule does not genuinely depend on risk;
  the eval measures how often mislabelled risk changes the outcome.
- **Gatekit decides; it does not execute.** It cannot stop an agent that never
  calls it, or one that calls it and then ignores a `deny`. Give agents the
  credentials for real systems only through code paths that go through
  `guard()`.
- **The rate limiter is per instance.** Multiple server instances multiply the
  effective limit. A shared store is needed before relying on it for abuse
  protection at scale.
- **Any organization member can edit policies** today; role gating for policy
  changes is not yet enforced. Policy changes are recorded in the audit chain
  with the acting user.
- **Secrets at rest.** The Slack webhook URL is stored in Postgres in plain
  text, as are Stripe customer ids. Protect database access accordingly.
