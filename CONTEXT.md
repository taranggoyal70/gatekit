# Gatekit — Domain glossary

This file defines Gatekit's domain language. It is a glossary, not a spec —
implementation details live in the code and README.

## Organization

A tenant. Every Agent, Policy, and Action belongs to exactly one
Organization. A user is lazily given a default Organization on first
sign-in (see `getOrCreateDefaultOrg`) and can belong to more than one —
"default" means the earliest membership by join time, picked
deterministically, not the org list's incidental database order. An
Organization has one **Plan** (`free`, `pro`, or `enterprise`) that governs
its Agent and Member limits (see `getPlanLimits`).

## Member and Role

A user's association with an Organization, with a Role of `owner`,
`admin`, or `member`. `owner`/`admin` may invite, remove, and re-role other
Members; `member` cannot. Every Organization must always have at least one
`owner` — the last owner can neither be demoted nor removed (see
`removeMember`, `updateMemberRole`).

## Invite

A pending offer for someone to join an Organization as a Member, sent to
an email address with a proposed Role (`admin` or `member` — an Invite
cannot grant `owner`). Has its own lifecycle
(`pending`/`accepted`/`revoked`/`expired`) independent of Approval's, even
though both use the same lazy-expiry pattern. Accepting an Invite requires
signing in with the exact email address it was sent to.

## Subscription

The Stripe-backed record of an Organization's paid plan: a `stripeCustomerId`,
a `stripeSubscriptionId`, and a `status` mirrored from Stripe's webhook
events. An Organization's `planTier` column is a denormalized cache of
this — updated whenever the Subscription changes — so plan-limit checks
never need to join out to Stripe or this table on every request.

## Agent

A registered caller of the Gatekit API — typically an AI agent process, not
a human. Identified by a hashed API key (`gk_live_...`). An Agent belongs to
one Organization. A **revoked** Agent's key stops authenticating but its
history is retained.

## Action

A single proposed operation an Agent asked Gatekit to evaluate — e.g. "send
this email," "issue this refund." Not the operation itself; Gatekit never
executes anything. An Action has an `actionType` (a caller-defined string
like `email.send`), a `target` (what the action affects — an email address,
a customer ID), and a `riskLevel`.

An Action's `status` is one of:
- **resolved** — a final decision (allow/deny) was made immediately, no
  human involved.
- **pending** — held for human review; an Approval exists.
- **approved** / **denied** — a human resolved the pending Approval.
- **expired** — no human decided before the Approval's window closed.

## Decision

The outcome of evaluating an Action against Policies: **allow** (may
proceed), **deny** (must not proceed), or **require_approval** (must wait
for a human). A Decision is not the same as an Action's `status` —
`require_approval` is a Decision; `pending` is the Action's status while
that Decision is still being carried out.

## Risk level

A caller-supplied severity for an Action: `low`, `medium`, `high`, or
`critical`. Ordered — Policies with a `minRiskLevel` match at that level or
above. Gatekit does not compute risk; the calling agent (or its developer)
assigns it.

## Policy

An org-scoped rule: if an Action's `actionType` and `target` match this
Policy's patterns, and the Action's risk is at least `minRiskLevel`, this
Policy's `decision` applies. Policies are evaluated in ascending `priority`
order; the first enabled match wins. See `src/lib/policy-engine.ts` for the
exact matching semantics (glob patterns, tie-breaking, the no-match
default).

## Approval

The human-review record created when an Action's Decision is
`require_approval`. Has its own `status` (pending/approved/denied/expired)
separate from — but always mirrored onto — the parent Action's status. An
Approval that isn't decided before `expiresAt` is lazily marked `expired`
the next time it's read (see `expirePastDueApprovals`), not by a background
job.

## Notification settings

An Organization's configuration for out-of-band alerts — currently just an
optional Slack incoming-webhook URL. When set, every Action that becomes
`require_approval` also posts a Slack message alongside the existing email
fan-out; a missing or failing webhook never blocks `evaluate()` (same
failure policy as email). The webhook URL is restricted to
`https://hooks.slack.com/services/...` — Gatekit's server POSTs to it
blindly, so accepting an arbitrary URL here would make the field an SSRF
relay.

## Guard

The SDK-side operation (`GatekitClient.guard()`) that evaluates an Action
and only invokes the caller's function if the Decision is `allow`, or
becomes `approved` after a human reviews it. Not a domain entity — a client
convenience over `evaluate` + `waitForApproval`.
