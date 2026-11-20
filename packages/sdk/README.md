# @gatekit/sdk

TypeScript client for [Gatekit](https://github.com/taranggoyal70/gatekit):
allow, deny or hold an AI agent's action before it runs, with every decision
recorded in a tamper-evident audit log.

```bash
npm install @gatekit/sdk
```

Create an agent key in the Gatekit dashboard under **Agents** (it is shown
once), then wrap each outbound action:

```ts
import { GatekitClient, GatekitDeniedError } from "@gatekit/sdk";

const gatekit = new GatekitClient({ apiKey: process.env.GATEKIT_KEY! });

await gatekit.guard(
  { actionType: "payment.refund", target: chargeId, riskLevel: "high" },
  () => stripe.refunds.create({ charge: chargeId }),
);
```

| Decision | What `guard()` does |
| :--- | :--- |
| `allow` | Runs your function and returns its result |
| `deny` | Throws `GatekitDeniedError` (`reason: "denied"`); your function never runs |
| `require_approval` | Polls every 3 s, for up to 10 minutes by default, until a human decides; then runs your function or throws `GatekitDeniedError` with `reason` `"approval_denied"`, `"approval_expired"` or `"timeout"` |

Options:

- `baseUrl`: your Gatekit deployment. Defaults to `https://gatekit.vercel.app`.
- `fetch`: a custom `fetch` implementation.
- `guard(input, fn, { timeoutMs, pollIntervalMs })`: how long to wait for a human.

Lower-level calls: `evaluate(input)`, `getActionStatus(actionId)` and
`waitForApproval(actionId, options)`. API errors throw `GatekitApiError`
with the server's `status`, `code` and message.

Requires a runtime with global `fetch` (Node.js 18+, Bun, Deno, browsers).
License: MIT.
