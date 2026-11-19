# README assets

Everything the top-level README shows, and where it came from.

## Generated (do not edit by hand)

| File | Source |
| :--- | :--- |
| `hero-dark.svg`, `hero-light.svg` (1280x640) | `hero-run.json` |
| `hero-mobile-dark.svg`, `hero-mobile-light.svg` (640 wide) | `hero-run.json` |
| `results-dark.svg`, `results-light.svg` | `eval/results/latest.json` (held-out split, by case type) |

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

`landing.jpg` (1440x800), `sdk.jpg` (825x458, the landing page's code
sample), `docs-quickstart.jpg` (1100x500) and `docs-rest.jpg` (1100x500) were
captured on 2026-11-19 from a local
production build of this branch (`next build && next start`), not from the
live deployment, which still runs the previous version. The build used
`NEXT_PUBLIC_SITE_URL=https://gatekit.vercel.app` so the docs show the real
host, and inert Clerk keys so public pages render without a sign-in. Headless
Chrome at device scale 1; crops only, no retouching. Each row of the README
grid shares one aspect ratio so the table lines up.

Dashboard screenshots (policies, approvals, audit log) need a signed-in
organization and are not included yet.
