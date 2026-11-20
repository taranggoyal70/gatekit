# Gatekit eval

A reproducible check of the three things Gatekit claims to do: decide
correctly, add little latency, and keep an audit record that cannot be
changed quietly. It needs no database, keys or network.

```bash
pnpm eval         # run everything; rewrites results/latest.json and RESULTS.md
pnpm eval:check   # rerun; fail if any decision, metric or tamper outcome changed (CI runs this)
```

Results: [RESULTS.md](RESULTS.md) (generated) and
[results/latest.json](results/latest.json).

## What is measured

| Part | Question | How |
| :--- | :--- | :--- |
| Decisions | Does a realistic policy set allow, deny and hold the right actions? | 180 labelled agent actions through `evaluateAction` with the reference policy pack. |
| Record path | Does the production code path make the same decisions? | All 180 cases replayed through `evaluateAndRecordAction` on PGlite with the policies loaded from the database; then a third of the holds are approved, a third denied, a third left pending, and the chain is verified. |
| Tamper suite | Does the audit log catch, or refuse, each way of changing history? | Twelve scenarios, each on a fresh database populated by that replay. |
| Latency | What does a decision cost? | The engine alone, per call, and the full record path, per call, on this machine. |

### Metrics

Each case has an expected decision: `allow` (safe), `deny` (must never run)
or `require_approval` (needs a human).

- **Unsafe allows**: cases that should have been denied or held but were
  allowed. This is the number that matters most; each one is an action that
  would have run with nobody looking.
- **False blocks**: safe cases that were denied.
- **Unnecessary holds**: safe cases sent to a human.
- **Per-decision precision and recall**, a confusion matrix and every miss.
- **By case type**: ordinary cases and each edge-case tag, separately.

## Where the cases come from

1. [`governance-brief.md`](governance-brief.md) is the plain-language rulebook
   for an invented company, Kestrel Supply Co.: an action catalog, risk
   guidance for agents, and 30 ordered rules. **Every label comes from this
   document**, not from Gatekit's behaviour.
2. [`cases/dev.jsonl`](cases/dev.jsonl) (60 cases) and the reference policy
   pack [`policies/reference.json`](policies/reference.json) (56 policies)
   were written together, by the same author (an AI coding agent working on
   this repository), with the pack tuned until it scored 60/60 on dev. That
   score is therefore not evidence of anything except that the pack encodes
   the brief.
3. The pack, the dev split and the runner were committed **before any test
   case existed** (commit `ecdc23c`).
4. [`cases/test.jsonl`](cases/test.jsonl) (120 cases) was then written by a
   **separate agent instance that was given only the brief**. It did not see
   the pack, the dev cases, the runner or the source. It was asked for about
   85 ordinary actions and about 35 tagged edge cases:
   - `edge:mislabelled-risk`: the agent's `riskLevel` contradicts the brief's
     guidance (a $7,000 refund marked `low`). Labelled by the rule's intent.
   - `edge:format`: targets or types a real agent might produce that deviate
     from the catalog format (`Prod.orders`, `API@PROD`, `production.sessions`,
     a lookalike domain). Labelled by intent.
   - `edge:unknown-action`: an action type outside the catalog.
   - `edge:boundary`: names right at a rule's edge (`release` vs `release-*`,
     `#announcements-eng`, exactly $500).
5. The test labels were audited against the brief **before scoring**; none
   were changed. The split was committed (`ecee479`) before the first run.
6. The first scoring of the held-out split is kept verbatim in
   [`results/heldout-ecee479.json`](results/heldout-ecee479.json). Anything
   that changes the pack or the engine afterwards is reported as a new,
   post-hoc result next to it, never in its place.

## Changes after the held-out run

| Date | Change | Why | Test split, first run → now |
| :--- | :--- | :--- | :--- |
| 2026-11-19 | Pattern matching ignores case (`src/lib/policy-engine.ts`). The pack is unchanged. | Seven held-out misses were targets like `Prod.orders`, `API@PROD` and `KESTREL/API:MAIN` that a human reads as matching the rule. | Correct 103 → 110 of 120; unsafe allows 14 → 10 of 59; false blocks 0 → 0 of 61; unnecessary holds 1 → 0 of 61. |

The "now" numbers are post-hoc: the change was chosen after seeing the
held-out misses, so they show what the change fixes on these cases, not how
the engine would do on new ones. A fresh held-out split, written the same way,
is the only way to get an independent number again.

What remains after the change: 8 of the 10 unsafe allows are agents
under-reporting risk on rules that key on risk, and 2 are names a glob cannot
connect (`production.sessions` against a `prod.*` rule, `billing@production`
against `*@prod`).

## How to read the results

- The held-out split is small (120 cases) and synthetic. It shows the
  *kinds* of failure a glob-and-risk policy engine has, and how often they
  occur in one plausible policy set. It does not estimate production
  accuracy for anyone else's policies.
- The edge-case share (36 of 120) is far higher than a real week's traffic
  would contain, on purpose. Read the **by case type** table rather than the
  headline accuracy.
- Both splits were written by models, and the same model family wrote the
  brief. The labels have not been reviewed by an independent human.
- One rule in the brief is ambiguous: its risk guidance calls changes to
  production data `high`, while rule 28 allows production writes below
  `high`. The test author resolved it case by case (routine cycle-count
  updates allowed, irreversible overwrites held); a different reader could
  label two or three of those cases differently.
- Latency comes from one laptop, with PGlite in the same process. It excludes
  the network hop from agent to Gatekit and from Gatekit to Postgres, which
  will dominate in a hosted deployment.
- The record path's concurrency guarantees (no two events share a sequence
  number, one reviewer wins) are tested separately against real Postgres 16
  in CI; PGlite runs on one connection, so it cannot exercise them.

## Files

```text
governance-brief.md     the rulebook every label comes from
policies/reference.json the 56-policy pack, frozen at ecdc23c
cases/dev.jsonl         60 cases the pack was tuned on
cases/test.jsonl        120 held-out cases from a separate author
run.ts                  the runner
results/latest.json     full results for the current engine, including every miss (generated)
results/heldout-ecee479.json  the first held-out scoring, kept verbatim
RESULTS.md              the same, as tables (generated)
```
