# README assets

Everything the top-level README shows, and where it came from.

## Generated (do not edit by hand)

| File | Source |
| :--- | :--- |
| `hero-dark.svg`, `hero-light.svg` (1280x640) | `hero-run.json` |
| `hero-mobile-dark.svg`, `hero-mobile-light.svg` (640 wide) | `hero-run.json` |
| `results-dark.svg`, `results-light.svg` | `eval/results/heldout-ecee479.json` (the held-out split's first run, by case type) |

All six are written by [`scripts/readme-assets.ts`](../../scripts/readme-assets.ts).

```bash
pnpm readme:assets            # rewrite the SVGs from hero-run.json and eval results
pnpm readme:assets --check    # fail if the committed SVGs differ (CI runs this)
pnpm readme:assets --capture  # re-record hero-run.json from a real run, then rewrite
```

### hero-run.json

A real recording, not a mock-up. `--capture` creates an organization in an
in-process PGlite database and loads the eval's 56-policy reference pack
through `createPolicy` (audit events #1 to #56, one `policy.created` each).
It then sends four dev cases (dev-045, dev-020, dev-001, dev-043) through the
production record path (`evaluateAndRecordAction`, events #57 to #60),
approves the held refund as `finance-lead` through `decideApproval` (event
#61), and runs `verifyOrgAudit`.
The decisions, matched policy names, sequence numbers and hashes in the hero
are copied from that run. The capture refuses to write if any decision
disagrees with the case's expected label or the chain does not verify.

### Animation

The hero animates with CSS keyframes only, because GitHub strips scripts and
web fonts from SVG. The resting style of every element is its final frame, so
a viewer that ignores animation (or a reader with `prefers-reduced-motion`
set, where animation is turned off) sees the complete, correct picture. To
inspect a frame, open the SVG in a browser and pause it in the developer
tools' Animations panel.

## Screenshots

All captured on 2026-11-19 with headless Chromium at device scale 1; crops
only, no retouching. `sdk.jpg` and `docs-quickstart.jpg` were recaptured the
same way on 2026-11-20, after the SDK was renamed to `@gatekithq/sdk`. Each row of the README grid shares one aspect ratio so
the table lines up.

### Public pages

`landing.jpg` (1440x800), `sdk.jpg` (825x458, the landing page's code
sample), `docs-quickstart.jpg` (840x500) and `docs-rest.jpg` (840x500) come
from a local production build of this branch (`next build && next start`),
not from the live deployment. The build used
`NEXT_PUBLIC_SITE_URL=https://gatekit.vercel.app` so the docs show the real
host, and inert Clerk keys so public pages render without a sign-in.

### Console

`console-overview.jpg`, `console-approvals.jpg`, `console-policies.jpg` and
`console-audit.jpg` (1440x900 each) come from `next dev` on this branch,
signed in to a throwaway Clerk development instance, against a local demo
database built like this:

1. Apply all migrations to an in-process PGlite database and create one
   organization, "Kestrel Supply Co.", on the Pro plan.
2. Load the eval's 56-policy reference pack through `createPolicy`.
3. Create four agents (ops, support, sales, finance) and send the 60 dev cases
   (`eval/cases/dev.jsonl`), interleaved by expected decision, through the
   production record path, `evaluateAndRecordAction`.
4. Decide the oldest 14 of the 22 held actions through `decideApproval`
   (every fourth one denied) and leave 8 pending.
5. Serve the database over the Postgres wire protocol and point
   `DATABASE_URL` at it; a throwaway Ed25519 key was set as
   `GATEKIT_CHECKPOINT_SIGNING_KEY` so the audit log shows a signed
   checkpoint.

Every number on screen is a live query against that database. The dev-mode
Next.js indicator and Clerk's development-instance prompt were hidden with
CSS before capture; nothing else was changed.
