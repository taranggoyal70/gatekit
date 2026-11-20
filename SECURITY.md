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
  count lives in Postgres and is updated in one atomic statement, so every
  server instance shares it.
- Creating, changing and deleting policies requires the `admin` or `owner`
  role, enforced in the API routes. Members can read policies.
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
   (`headSeq`, `headHash`). When the chain verifies and
   `GATEKIT_CHECKPOINT_SIGNING_KEY` is set, it also returns `signedCheckpoint`:
   the organization, sequence number and hash, signed with Ed25519
   ([`src/lib/checkpoint-signing.ts`](src/lib/checkpoint-signing.ts)). The
   public key is served at `GET /api/audit/public-key`, and
   `pnpm audit:verify-checkpoint` checks a checkpoint offline. Store
   checkpoints somewhere Gatekit's database cannot reach and pass `seq` and
   `hash` back as `checkpointSeq` / `checkpointHash`; verification then also
   catches the newest events being dropped, or the chain being rewritten and
   fully re-hashed after that point. The signature means a checkpoint cannot
   be fabricated later by someone who only controls the database.

The [eval](eval/README.md) runs twelve tampering scenarios against these
guarantees on every CI run.

## Known limits

- **A database owner can defeat prevention.** Anyone who can disable the
  trigger or `TRUNCATE` the table can change events. They cannot do it
  without detection unless they also rewrite every later hash, and they
  cannot do that past a checkpoint you stored elsewhere. Without a stored
  checkpoint, dropping the newest events is not detectable from the database
  alone.
- **The signing key is an environment variable.** Whoever can read the
  deployment's environment can sign checkpoints. Keep it out of the database
  and out of preview environments, and rotate it if exposed; every checkpoint
  carries the key id that signed it. A managed KMS or hardware key would
  remove this exposure.
- **Risk levels come from the agent.** Policies can match on risk, and Gatekit
  trusts the agent's label. An agent that under-reports risk can get an action
  allowed that a higher label would have held. Write deny and hold rules on
  action type and target wherever the rule does not genuinely depend on risk;
  the eval measures how often mislabelled risk changes the outcome.
- **Gatekit decides; it does not execute.** It cannot stop an agent that never
  calls it, or one that calls it and then ignores a `deny`. Give agents the
  credentials for real systems only through code paths that go through
  `guard()`.
- **The rate limit is a fixed window.** An agent can make up to twice the
  limit across a window boundary. It limits runaway agents; it is not a
  defence against a distributed attack.
- **Email needs a verified sender.** Approval and invite email is sent only
  when both `RESEND_API_KEY` and `GATEKIT_NOTIFICATION_FROM` are set; there is
  no built-in default sender.
- **Secrets at rest.** The Slack webhook URL is stored in Postgres in plain
  text, as are Stripe customer ids. Protect database access accordingly.
