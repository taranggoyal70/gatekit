/**
 * README graphics, generated from committed data.
 *
 *   pnpm readme:assets             rewrite every SVG in assets/readme/
 *   pnpm readme:assets --check     fail if a committed SVG differs (CI runs this)
 *   pnpm readme:assets --capture   re-record assets/readme/hero-run.json
 *
 * The hero animates a real recorded run: the reference policy pack from the
 * eval is loaded into a fresh in-process Postgres, four dev-split actions go
 * through the production record path, one held action is approved, and the
 * chain is verified. Every decision, policy name, sequence number and hash in
 * the picture is copied from that run. Without --capture nothing executes:
 * the SVGs are a pure function of hero-run.json and eval/results/heldout-ecee479.json.
 *
 * SVGs are served to GitHub readers as images: CSS animation runs, scripts
 * and web fonts do not. Each element's resting style is its final frame and
 * prefers-reduced-motion disables animation, so a static renderer shows the
 * finished story.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets", "readme");
const RUN_FILE = path.join(ASSETS, "hero-run.json");
// The chart shows the first, genuinely held-out scoring; later engine changes are post-hoc.
const RESULTS_FILE = path.join(ROOT, "eval", "results", "heldout-ecee479.json");

// ---------------------------------------------------------------- data

type Decision = "allow" | "deny" | "require_approval";

type HeroStep = {
  agent: string;
  actionType: string;
  target: string;
  riskLevel: string;
  scenario: string;
  decision: Decision;
  policy: string;
  seq: number;
  hash: string;
  prevHash: string;
  approval?: { decision: "approved" | "denied"; seq: number; hash: string; prevHash: string; reviewer: string };
};

type HeroRun = {
  recordedAt: string;
  commit: string | null;
  policyPack: string;
  policies: number;
  cases: string[];
  steps: HeroStep[];
  verification: { ok: boolean; events: number; headSeq: number; headHash: string };
};

const HERO_CASES = ["dev-045", "dev-020", "dev-001", "dev-043"];

async function capture() {
  const { execFileSync } = await import("node:child_process");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { eq } = await import("drizzle-orm");
  const schema = await import("../src/db/schema");
  const { evaluateAndRecordAction } = await import("../src/lib/services/actions");
  const { createAgent } = await import("../src/lib/services/agents");
  const { decideApproval } = await import("../src/lib/services/approvals");
  const { verifyOrgAudit } = await import("../src/lib/services/audit");
  const { createPolicy } = await import("../src/lib/services/policies");

  const pack = JSON.parse(readFileSync(path.join(ROOT, "eval/policies/reference.json"), "utf8")) as {
    name: string;
    policies: { briefRule: number; name: string; actionTypePattern: string; targetPattern: string; minRiskLevel: "low" | "medium" | "high" | "critical"; decision: Decision; priority: number; enabled: boolean }[];
  };
  const cases = readFileSync(path.join(ROOT, "eval/cases/dev.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { id: string; agent: string; scenario: string; actionType: string; target: string; riskLevel: "low" | "medium" | "high" | "critical"; expected: Decision });

  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: path.join(ROOT, "src/db/migrations") });
  const [org] = await database.insert(schema.organizations).values({ name: "Kestrel Supply Co.", slug: "kestrel" }).returning();
  const orgId = org!.id;
  const { agent } = await createAgent(database, orgId, { name: "kestrel-agents" });
  for (const { briefRule: _rule, ...policy } of pack.policies) await createPolicy(database, orgId, policy, "user:security-lead");

  const steps: HeroStep[] = [];
  const pendingApprovals = new Map<HeroStep, string>();
  for (const id of HERO_CASES) {
    const testCase = cases.find((item) => item.id === id);
    if (!testCase) throw new Error(`Missing hero case ${id}`);
    const { action, approval } = await evaluateAndRecordAction(database, orgId, agent.id, testCase);
    if (action.decision !== testCase.expected) throw new Error(`${id}: engine disagrees with its label`);
    const [event] = await database
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.actionId, action.id));
    const policy = (event!.payload.policy as { name: string } | null)?.name ?? "default";
    const step: HeroStep = {
      agent: testCase.agent,
      actionType: testCase.actionType,
      target: testCase.target,
      riskLevel: testCase.riskLevel,
      scenario: testCase.scenario,
      decision: action.decision,
      policy,
      seq: event!.seq,
      hash: event!.hash,
      prevHash: event!.prevHash,
    };
    steps.push(step);
    if (approval) pendingApprovals.set(step, approval.id);
  }
  const reviewer = "finance-lead";
  for (const [step, approvalId] of pendingApprovals) {
    const { action } = await decideApproval(database, orgId, approvalId, reviewer, {
      decision: "approved",
      reason: "Photos confirm the damaged pallet.",
    });
    const events = await database.select().from(schema.auditEvents).where(eq(schema.auditEvents.actionId, action!.id));
    const decided = events.find((event) => event.eventType === "approval.decided")!;
    step.approval = { decision: "approved", seq: decided.seq, hash: decided.hash, prevHash: decided.prevHash, reviewer };
  }
  const verification = await verifyOrgAudit(database, orgId);
  if (!verification.ok) throw new Error("Hero run failed verification");

  let commit: string | null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    commit = null;
  }
  const run: HeroRun = {
    recordedAt: new Date().toISOString(),
    commit,
    policyPack: pack.name,
    policies: pack.policies.length,
    cases: HERO_CASES,
    steps,
    verification: {
      ok: verification.ok,
      events: verification.chain.checked,
      headSeq: verification.chain.headSeq,
      headHash: verification.chain.headHash,
    },
  };
  writeFileSync(RUN_FILE, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`Recorded ${RUN_FILE}`);
}

// ---------------------------------------------------------------- palette

type Theme = {
  bg: string;
  panel: string;
  panelLine: string;
  ink: string;
  muted: string;
  faint: string;
  allow: string;
  allowBg: string;
  deny: string;
  denyBg: string;
  hold: string;
  holdBg: string;
  signal: string;
  signalInk: string;
};

// Gatekit's own palette (src/app/globals.css: --gate-paper, --gate-ink, --gate-signal).
const THEMES: Record<"dark" | "light", Theme> = {
  dark: {
    bg: "#0e1411",
    panel: "#151d19",
    panelLine: "#26322c",
    ink: "#edf1ed",
    muted: "#9aa69f",
    faint: "#5f6b65",
    allow: "#4fe3a1",
    allowBg: "#4fe3a11f",
    deny: "#ff6b6b",
    denyBg: "#ff6b6b1f",
    hold: "#ffc15a",
    holdBg: "#ffc15a1f",
    signal: "#d9ff3f",
    signalInk: "#111815",
  },
  light: {
    bg: "#edf1ed",
    panel: "#ffffff",
    panelLine: "#cfd8d2",
    ink: "#111815",
    muted: "#55625b",
    faint: "#8a968f",
    allow: "#0b7a4b",
    allowBg: "#0b7a4b14",
    deny: "#c22f2b",
    denyBg: "#c22f2b14",
    hold: "#9a5a00",
    holdBg: "#9a5a0014",
    signal: "#d9ff3f",
    signalInk: "#111815",
  },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------- animation

const LOOP = 15;
const FADE_OUT_START = 14.1;
const FADE_OUT_END = 14.7;

class Timeline {
  private rules: string[] = [];
  private names = new Map<string, string>();

  /** Fade (and rise) in at `at` seconds; optionally fade out at `out`. Returns a class. */
  appear(at: number, out?: number, rise = 6): string {
    const key = `${at}|${out ?? ""}|${rise}`;
    const existing = this.names.get(key);
    if (existing) return existing;
    const name = `t${this.names.size}`;
    this.names.set(key, name);
    const p = (seconds: number) => `${((seconds / LOOP) * 100).toFixed(2)}%`;
    const shown = `opacity:1;transform:translateY(0)`;
    const hidden = `opacity:0;transform:translateY(${rise}px)`;
    const frames =
      out === undefined
        ? `0%,${p(at)}{${hidden}}${p(at + 0.45)},${p(FADE_OUT_START)}{${shown}}${p(FADE_OUT_END)},100%{opacity:0;transform:translateY(0)}`
        : `0%,${p(at)}{${hidden}}${p(at + 0.45)},${p(out)}{${shown}}${p(out + 0.4)},100%{opacity:0;transform:translateY(0)}`;
    this.rules.push(`@keyframes ${name}{${frames}}.${name}{animation:${name} ${LOOP}s infinite both ease-out}`);
    return name;
  }

  /** Draw a stroke on at `at` seconds. Resting state is fully drawn. */
  draw(at: number, length: number): string {
    const key = `draw|${at}|${length}`;
    const existing = this.names.get(key);
    if (existing) return existing;
    const name = `d${this.names.size}`;
    this.names.set(key, name);
    const p = (seconds: number) => `${((seconds / LOOP) * 100).toFixed(2)}%`;
    this.rules.push(
      `@keyframes ${name}{0%,${p(at)}{stroke-dashoffset:${length};opacity:1}${p(at + 0.5)},${p(FADE_OUT_START)}{stroke-dashoffset:0;opacity:1}${p(FADE_OUT_END)},100%{stroke-dashoffset:0;opacity:0}}.${name}{stroke-dasharray:${length};animation:${name} ${LOOP}s infinite both ease-in-out}`,
    );
    return name;
  }

  css() {
    return `${this.rules.join("")}@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
  }
}

// ---------------------------------------------------------------- pieces

const LABEL: Record<Decision, string> = { allow: "ALLOW", deny: "DENY", require_approval: "HOLD" };

function decisionColors(theme: Theme, decision: Decision | "approved") {
  if (decision === "allow" || decision === "approved") return { fg: theme.allow, bg: theme.allowBg };
  if (decision === "deny") return { fg: theme.deny, bg: theme.denyBg };
  return { fg: theme.hold, bg: theme.holdBg };
}

function stamp(theme: Theme, x: number, y: number, text: string, decision: Decision | "approved", cls: string, resting: 0 | 1 = 1) {
  const { fg, bg } = decisionColors(theme, decision);
  const width = 22 + text.length * 9.6;
  return `<g class="${cls}" style="opacity:${resting}"><rect x="${x}" y="${y}" width="${width}" height="28" rx="6" fill="${bg}" stroke="${fg}" stroke-width="1.5"/><text x="${x + width / 2}" y="${y + 19}" text-anchor="middle" font-family="${MONO}" font-size="14" font-weight="700" letter-spacing="1.2" fill="${fg}">${esc(text)}</text></g>`;
}

function short(hash: string) {
  return `${hash.slice(0, 12)}…`;
}

const CHAIN_X = 790;
const CHAIN_W = 450;

/** Gatekit's mark, as on the site header: a lime tile with "G/". */
function mark(x: number, y: number, theme: Theme) {
  return `<rect x="${x}" y="${y}" width="30" height="30" rx="4" fill="${theme.signal}"/><text x="${x + 15}" y="${y + 20}" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="700" fill="${theme.signalInk}">G/</text>`;
}

// ---------------------------------------------------------------- hero, desktop

function heroDesktop(run: HeroRun, theme: Theme) {
  const W = 1280;
  const H = 640;
  const tl = new Timeline();
  const out: string[] = [];
  const steps = run.steps;
  const rowY = (index: number) => 132 + index * 104;
  const stepAt = (index: number) => 0.4 + index * 1.9;
  const approvalAt = stepAt(steps.length) + 0.4;
  const verifyAt = approvalAt + 1.6;

  out.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
  // Column headers
  const header = (x: number, label: string) =>
    `<text x="${x}" y="92" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${theme.muted}">${label}</text>`;
  out.push(mark(40, 26, theme));
  out.push(
    `<text x="82" y="49" font-family="${SANS}" font-size="22" font-weight="700" fill="${theme.ink}">Every agent action is decided before it runs, and recorded so it cannot be quietly changed.</text>`,
  );
  out.push(header(40, "AGENT REQUESTS"), header(500, "GATEKIT DECISION"), header(CHAIN_X, "AUDIT CHAIN"));

  // Gate spine
  out.push(`<line x1="480" y1="108" x2="480" y2="${rowY(steps.length - 1) + 78}" stroke="${theme.panelLine}" stroke-width="2"/>`);

  // Chain rows (events): one per step plus the approval
  const chainEvents: { label: string; seq: number; hash: string; prevHash: string; at: number; decision: Decision | "approved"; row: number }[] = [];

  steps.forEach((step, index) => {
    const y = rowY(index);
    const at = stepAt(index);
    const card = tl.appear(at);
    out.push(
      `<g class="${card}"><rect x="40" y="${y}" width="410" height="80" rx="10" fill="${theme.panel}" stroke="${theme.panelLine}"/>` +
        `<text x="60" y="${y + 30}" font-family="${MONO}" font-size="16" font-weight="700" fill="${theme.ink}">${esc(step.actionType)}</text>` +
        `<text x="60" y="${y + 54}" font-family="${MONO}" font-size="13" fill="${theme.muted}">${esc(step.target)}</text>` +
        `<text x="430" y="${y + 30}" text-anchor="end" font-family="${MONO}" font-size="11" letter-spacing="1" fill="${theme.faint}">${esc(step.agent.toUpperCase())} AGENT</text>` +
        `<text x="430" y="${y + 54}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${theme.muted}">risk: ${esc(step.riskLevel)}</text></g>`,
    );
    // connector into the gate
    const connector = tl.draw(at + 0.35, 42);
    out.push(`<line class="${connector}" x1="452" y1="${y + 40}" x2="494" y2="${y + 40}" stroke="${theme.faint}" stroke-width="2"/>`);

    const decided = at + 0.8;
    if (step.decision === "require_approval" && step.approval) {
      out.push(stamp(theme, 500, y + 12, LABEL.require_approval, "require_approval", tl.appear(decided, approvalAt), 0));
      out.push(stamp(theme, 500, y + 12, "APPROVED", "approved", tl.appear(approvalAt + 0.2)));
      out.push(
        `<text class="${tl.appear(approvalAt + 0.4)}" x="${500 + 22 + 8 * 9.6 + 12}" y="${y + 31}" font-family="${SANS}" font-size="13" fill="${theme.muted}">by ${esc(step.approval.reviewer)}</text>`,
      );
    } else {
      out.push(stamp(theme, 500, y + 12, LABEL[step.decision], step.decision, tl.appear(decided)));
    }
    out.push(
      `<text class="${tl.appear(decided + 0.15)}" x="502" y="${y + 64}" font-family="${SANS}" font-size="13" fill="${theme.muted}">${esc(step.policy)}</text>`,
    );
    chainEvents.push({ label: "action.evaluated", seq: step.seq, hash: step.hash, prevHash: step.prevHash, at: decided + 0.35, decision: step.decision, row: index });
    if (step.approval) {
      chainEvents.push({ label: "approval.decided", seq: step.approval.seq, hash: step.approval.hash, prevHash: step.approval.prevHash, at: approvalAt + 0.6, decision: "approved", row: steps.length });
    }
  });

  // Audit chain blocks, in sequence order, stacked
  const ordered = [...chainEvents].sort((a, b) => a.seq - b.seq);
  const blockY = (index: number) => 132 + index * 82;
  ordered.forEach((event, index) => {
    const y = blockY(index);
    const cls = tl.appear(event.at, undefined, 10);
    const { fg } = decisionColors(theme, event.decision);
    out.push(
      `<g class="${cls}"><rect x="${CHAIN_X}" y="${y}" width="${CHAIN_W}" height="64" rx="8" fill="${theme.panel}" stroke="${theme.panelLine}"/>` +
        `<rect x="${CHAIN_X}" y="${y}" width="5" height="64" rx="2" fill="${fg}"/>` +
        `<text x="${CHAIN_X + 20}" y="${y + 25}" font-family="${MONO}" font-size="13" font-weight="700" fill="${theme.ink}">#${event.seq}  ${esc(event.label)}</text>` +
        `<text x="${CHAIN_X + 20}" y="${y + 47}" font-family="${MONO}" font-size="12" fill="${theme.muted}">hash ${short(event.hash)}   prev ${short(event.prevHash)}</text></g>`,
    );
    if (index > 0) {
      const link = tl.draw(event.at, 18);
      out.push(`<line class="${link}" x1="${CHAIN_X + 40}" y1="${y - 18}" x2="${CHAIN_X + 40}" y2="${y}" stroke="${theme.faint}" stroke-width="2" stroke-dasharray="3 3"/>`);
    }
  });

  // Verification bar
  const verify = tl.appear(verifyAt, undefined, 8);
  const vy = blockY(ordered.length);
  out.push(
    `<g class="${verify}"><rect x="${CHAIN_X}" y="${vy}" width="${CHAIN_W}" height="40" rx="8" fill="${theme.signal}"/>` +
      `<text x="${CHAIN_X + 20}" y="${vy + 26}" font-family="${MONO}" font-size="14" font-weight="700" fill="${theme.signalInk}">✓ chain verified · ${run.verification.events} events · head #${run.verification.headSeq}</text></g>`,
  );

  out.push(
    `<text x="40" y="${H - 22}" font-family="${SANS}" font-size="12" fill="${theme.faint}">Recorded run: ${run.policies}-policy reference pack from the eval, real decisions and SHA-256 hashes (assets/readme/hero-run.json).</text>`,
  );

  return wrap(W, H, run, tl, out.join(""));
}

// ---------------------------------------------------------------- hero, mobile

function heroMobile(run: HeroRun, theme: Theme) {
  const W = 640;
  const steps = run.steps;
  const tl = new Timeline();
  const out: string[] = [];
  const stepAt = (index: number) => 0.4 + index * 1.9;
  const approvalAt = stepAt(steps.length) + 0.4;
  const verifyAt = approvalAt + 1.6;
  const rowY = (index: number) => 96 + index * 116;
  const chainTop = rowY(steps.length) + 14;
  const H = chainTop + 236;

  out.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
  out.push(mark(28, 22, theme));
  out.push(`<text x="70" y="44" font-family="${SANS}" font-size="22" font-weight="700" fill="${theme.ink}">Decided before it runs.</text>`);
  out.push(`<text x="70" y="72" font-family="${SANS}" font-size="22" font-weight="700" fill="${theme.ink}">Recorded so it cannot be quietly changed.</text>`);

  steps.forEach((step, index) => {
    const y = rowY(index);
    const at = stepAt(index);
    out.push(
      `<g class="${tl.appear(at)}"><rect x="28" y="${y}" width="584" height="100" rx="10" fill="${theme.panel}" stroke="${theme.panelLine}"/>` +
        `<text x="48" y="${y + 32}" font-family="${MONO}" font-size="18" font-weight="700" fill="${theme.ink}">${esc(step.actionType)}</text>` +
        `<text x="48" y="${y + 58}" font-family="${MONO}" font-size="15" fill="${theme.muted}">${esc(step.target)}</text>` +
        `<text x="48" y="${y + 84}" font-family="${SANS}" font-size="14" fill="${theme.faint}">${esc(step.agent)} agent · risk ${esc(step.riskLevel)} · ${esc(step.policy)}</text></g>`,
    );
    const decided = at + 0.8;
    const sx = (text: string) => 592 - (22 + text.length * 9.6);
    if (step.decision === "require_approval" && step.approval) {
      out.push(stamp(theme, sx("HOLD"), y + 14, "HOLD", "require_approval", tl.appear(decided, approvalAt), 0));
      out.push(stamp(theme, sx("APPROVED"), y + 14, "APPROVED", "approved", tl.appear(approvalAt + 0.2)));
    } else {
      out.push(stamp(theme, sx(LABEL[step.decision]), y + 14, LABEL[step.decision], step.decision, tl.appear(decided)));
    }
  });

  out.push(`<text x="28" y="${chainTop + 16}" font-family="${MONO}" font-size="13" letter-spacing="2" fill="${theme.muted}">AUDIT CHAIN</text>`);
  const events = [
    ...steps.map((step, index) => ({ seq: step.seq, hash: step.hash, decision: step.decision as Decision | "approved", at: stepAt(index) + 1.15 })),
    ...steps.filter((step) => step.approval).map((step) => ({ seq: step.approval!.seq, hash: step.approval!.hash, decision: "approved" as const, at: approvalAt + 0.6 })),
  ].sort((a, b) => a.seq - b.seq);
  const bw = 108;
  const gap = (584 - events.length * bw) / Math.max(1, events.length - 1);
  events.forEach((event, index) => {
    const x = 28 + index * (bw + gap);
    const y = chainTop + 30;
    const { fg } = decisionColors(theme, event.decision);
    out.push(
      `<g class="${tl.appear(event.at, undefined, 10)}"><rect x="${x}" y="${y}" width="${bw}" height="76" rx="8" fill="${theme.panel}" stroke="${theme.panelLine}"/>` +
        `<rect x="${x}" y="${y}" width="${bw}" height="5" rx="2" fill="${fg}"/>` +
        `<text x="${x + 12}" y="${y + 34}" font-family="${MONO}" font-size="16" font-weight="700" fill="${theme.ink}">#${event.seq}</text>` +
        `<text x="${x + 12}" y="${y + 60}" font-family="${MONO}" font-size="13" fill="${theme.muted}">${event.hash.slice(0, 8)}</text></g>`,
    );
    if (index > 0) {
      out.push(`<line class="${tl.draw(event.at, gap)}" x1="${x - gap}" y1="${y + 38}" x2="${x}" y2="${y + 38}" stroke="${theme.faint}" stroke-width="2"/>`);
    }
  });
  const vy = chainTop + 126;
  out.push(
    `<g class="${tl.appear(verifyAt, undefined, 8)}"><rect x="28" y="${vy}" width="584" height="48" rx="8" fill="${theme.signal}"/>` +
      `<text x="48" y="${vy + 31}" font-family="${MONO}" font-size="16" font-weight="700" fill="${theme.signalInk}">✓ chain verified · ${run.verification.events} events · head #${run.verification.headSeq}</text></g>`,
  );
  out.push(`<text x="28" y="${H - 24}" font-family="${SANS}" font-size="13" fill="${theme.faint}">Recorded run with the eval's ${run.policies}-policy pack; real decisions and hashes.</text>`);
  return wrap(W, H, run, tl, out.join(""));
}

function heroDescription(run: HeroRun) {
  const parts = run.steps.map((step) => {
    const verdict =
      step.decision === "require_approval"
        ? `held for a human and then approved by ${step.approval?.reviewer ?? "a reviewer"}`
        : step.decision === "allow"
          ? "allowed"
          : "denied";
    return `${step.actionType} on ${step.target} at ${step.riskLevel} risk is ${verdict} (${step.policy})`;
  });
  return `Animated replay of a recorded Gatekit run with the eval's ${run.policies}-policy reference pack. ${parts.join("; ")}. Each decision is appended to a SHA-256 hash chain as events #${run.steps[0]?.seq} to #${run.verification.headSeq}, and the chain verifies: ${run.verification.events} events.`;
}

function wrap(W: number, H: number, run: HeroRun, tl: Timeline, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Gatekit: policy gates, human approvals and a tamper-evident audit chain for AI agent actions</title>
<desc id="desc">${esc(heroDescription(run))}</desc>
<style>${tl.css()}</style>
${body}
</svg>
`;
}

// ---------------------------------------------------------------- results chart

type CaseType = { cases: number; correct: number; unsafeAllows: number; shouldBeGated: number };

function resultsChart(theme: Theme) {
  const results = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
  const test = results.deterministic.classification.test as {
    cases: number;
    correct: number;
    byTag: Record<string, CaseType>;
    unsafeAllow: { count: number; of: number };
  };
  const order: [string, string][] = [
    ["ordinary", "Ordinary actions"],
    ["edge:unknown-action", "Action not in the catalog"],
    ["edge:boundary", "Name at a rule boundary"],
    ["edge:format", "Unexpected target format"],
    ["edge:mislabelled-risk", "Agent under-reports risk"],
  ];
  const rows = order.filter(([key]) => test.byTag[key]);
  const W = 1280;
  const rowH = 58;
  const top = 108;
  const H = top + rows.length * rowH + 70;
  const barX = 360;
  const barW = 580;
  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="${theme.bg}"/>`);
  out.push(`<text x="40" y="48" font-family="${SANS}" font-size="22" font-weight="700" fill="${theme.ink}">Held-out decisions by case type: ${test.correct}/${test.cases} correct, ${test.unsafeAllow.count} of ${test.unsafeAllow.of} gated actions let through</text>`);
  out.push(`<text x="40" y="78" font-family="${SANS}" font-size="14" fill="${theme.muted}">Bar length: cases. Green: correct decision. Red: should have been denied or held, was allowed. Amber: other wrong decision.</text>`);
  rows.forEach(([key, label], index) => {
    const t = test.byTag[key]!;
    const y = top + index * rowH;
    const scale = barW / Math.max(...rows.map(([k]) => test.byTag[k]!.cases));
    const wrongOther = t.cases - t.correct - t.unsafeAllows;
    out.push(`<text x="40" y="${y + 24}" font-family="${SANS}" font-size="16" fill="${theme.ink}">${esc(label)}</text>`);
    let x = barX;
    const seg = (count: number, color: string) => {
      if (count <= 0) return;
      const w = Math.max(3, count * scale);
      out.push(`<rect x="${x}" y="${y + 6}" width="${w.toFixed(1)}" height="26" rx="3" fill="${color}"/>`);
      x += w + 2;
    };
    seg(t.correct, theme.allow);
    seg(t.unsafeAllows, theme.deny);
    seg(wrongOther, theme.hold);
    out.push(
      `<text x="${x + 10}" y="${y + 25}" font-family="${MONO}" font-size="14" fill="${theme.muted}">${t.correct}/${t.cases} correct · ${t.unsafeAllows}/${t.shouldBeGated} let through</text>`,
    );
  });
  out.push(`<text x="40" y="${H - 24}" font-family="${SANS}" font-size="12" fill="${theme.faint}">Source: eval/results/heldout-ecee479.json, the first scoring of 120 held-out cases written from the governance brief by a separate author; policy pack frozen first.</text>`);
  const desc = `Bar chart of held-out eval results by case type. ${rows
    .map(([key, label]) => {
      const t = test.byTag[key]!;
      return `${label}: ${t.correct} of ${t.cases} correct, ${t.unsafeAllows} of ${t.shouldBeGated} gated actions allowed`;
    })
    .join(". ")}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Gatekit held-out eval by case type</title>
<desc id="desc">${esc(desc)}</desc>
${out.join("")}
</svg>
`;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--capture")) await capture();

  const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as HeroRun;
  const files: Record<string, string> = {
    "hero-dark.svg": heroDesktop(run, THEMES.dark),
    "hero-light.svg": heroDesktop(run, THEMES.light),
    "hero-mobile-dark.svg": heroMobile(run, THEMES.dark),
    "hero-mobile-light.svg": heroMobile(run, THEMES.light),
    "results-dark.svg": resultsChart(THEMES.dark),
    "results-light.svg": resultsChart(THEMES.light),
  };

  if (args.includes("--check")) {
    const stale = Object.entries(files).filter(([name, content]) => {
      try {
        return readFileSync(path.join(ASSETS, name), "utf8") !== content;
      } catch {
        return true;
      }
    });
    if (stale.length > 0) {
      console.error(`README assets out of date: ${stale.map(([name]) => name).join(", ")}. Run pnpm readme:assets.`);
      process.exit(1);
    }
    console.log(`README assets match their sources (${Object.keys(files).length} files).`);
    return;
  }

  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(ASSETS, name), content);
  console.log(`Wrote ${Object.keys(files).length} files to assets/readme/.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
