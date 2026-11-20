# Contributing

Gatekit sits in front of real-world actions, so changes are held to one rule:
**a change must never make Gatekit allow something it would have stopped, or
let history change without detection, unless that is the explicit point of
the change and the eval says so.**

## Set up

Node.js 20 or newer (CI uses 22) and pnpm 11.

```bash
pnpm install
pnpm verify      # lint, typecheck, tests, eval check, README asset check
```

`pnpm verify` needs no database, keys or network: integration tests and the
eval run on in-process PGlite. To run the app itself you need Clerk keys and a
Postgres `DATABASE_URL`; see [.env.example](.env.example).

## Before you open a pull request

- `pnpm verify` passes. CI also runs the tests against Postgres 16, which is
  the only place concurrency (advisory locks, conditional updates) is really
  exercised.
- New behaviour has a test at the lowest level that can show it: pure logic in
  `src/lib/*.test.ts`, SQL and transactions in
  `src/lib/services/*.integration.test.ts` (real Postgres semantics, never a
  mocked query builder).
- Bug fixes start with a failing test that reproduces the bug.
- Schema changes go through `pnpm db:generate` (drizzle-kit). Never edit a
  generated migration or snapshot by hand; write custom SQL (triggers,
  checks) with `pnpm drizzle-kit generate --custom`.

## Changing decisions or the audit log

- Anything that can change a decision (`src/lib/policy-engine.ts`, the
  evaluate path, defaults) must keep `pnpm eval:check` passing. If the change
  is *meant* to move a number, run `pnpm eval`, commit the new
  `eval/results/latest.json`, and explain the movement in the pull request.
- **Do not edit `eval/policies/reference.json` or `eval/cases/test.jsonl` to
  improve a score.** The held-out split only means something because neither
  was touched after it was written; see [eval/README.md](eval/README.md). New
  cases go in a new split with its own provenance.
- Every write that changes governance state (actions, approvals, policies)
  must append its audit event in the same transaction
  (`appendAuditEvent(tx, …)`), and `verifyOrgAudit` must still cover it.
- If you change the hash format, existing chains stop verifying. Version the
  record instead.

## README graphics

The SVGs in `assets/readme/` are generated: run `pnpm readme:assets` after
changing eval results or the generator, and commit the output. CI fails if
they drift. See [assets/readme/README.md](assets/readme/README.md).

## Commits

Write commit messages that say what changed and why; the history is the
change log.

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
