/**
 * Gatekit policy and audit eval.
 *
 *   pnpm eval          run everything, write eval/results/latest.json and eval/RESULTS.md
 *   pnpm eval:check    rerun and fail if any deterministic result drifted from latest.json
 *
 * Deterministic parts (decisions, metrics, tamper detection) must reproduce
 * exactly on any machine. Latency is reported with the machine it ran on and
 * is excluded from --check.
 *
 * Runs on in-process PGlite: no database, keys or network needed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "../src/db/schema";
import { evaluateAction, type Decision, type PolicyRule, type RiskLevel } from "../src/lib/policy-engine";
import { evaluateAndRecordAction } from "../src/lib/services/actions";
import { createAgent } from "../src/lib/services/agents";
import { decideApproval } from "../src/lib/services/approvals";
import { verifyOrgAudit } from "../src/lib/services/audit";
import { createPolicy, updatePolicy } from "../src/lib/services/policies";
import type { Database } from "../src/lib/services/types";

const ROOT = path.resolve(__dirname, "..");
const EVAL = path.join(ROOT, "eval");
const RESULTS_JSON = path.join(EVAL, "results", "latest.json");
const RESULTS_MD = path.join(EVAL, "RESULTS.md");
// The first scoring of the held-out split, kept verbatim. Any engine or pack
// change after it makes later test-split numbers post-hoc, so both are shown.
const HELDOUT_JSON = path.join(EVAL, "results", "heldout-ecee479.json");
const DECISIONS: Decision[] = ["allow", "deny", "require_approval"];

type Case = {
  id: string;
  agent: string;
  scenario: string;
  actionType: string;
  target: string;
  riskLevel: RiskLevel;
  expected: Decision;
  briefRule: number;
  tags?: string[];
};

type PolicyPack = {
  name: string;
  policies: (Omit<PolicyRule, "id"> & { briefRule: number })[];
};

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function readText(relative: string) {
  return readFileSync(path.join(EVAL, relative), "utf8");
}

function loadCases(relative: string): Case[] {
  return readText(relative)
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      const value = JSON.parse(line) as Case;
      if (!DECISIONS.includes(value.expected)) {
        throw new Error(`${relative}:${index + 1}: bad expected decision ${value.expected}`);
      }
      return value;
    });
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 10000) / 100);

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

function summarize(samples: number[], digits: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (value: number) => Number(value.toFixed(digits));
  return {
    n: sorted.length,
    median: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted.at(-1) ?? 0),
  };
}

// ---------------------------------------------------------------- classification

function score(cases: Case[], rules: PolicyRule[]) {
  const confusion: Record<Decision, Record<Decision, number>> = {
    allow: { allow: 0, deny: 0, require_approval: 0 },
    deny: { allow: 0, deny: 0, require_approval: 0 },
    require_approval: { allow: 0, deny: 0, require_approval: 0 },
  };
  const misses: {
    id: string;
    scenario: string;
    actionType: string;
    target: string;
    riskLevel: RiskLevel;
    expected: Decision;
    got: Decision;
    matchedPolicy: string | null;
    tags: string[];
  }[] = [];

  for (const testCase of cases) {
    const result = evaluateAction(testCase, rules);
    confusion[testCase.expected][result.decision] += 1;
    if (result.decision !== testCase.expected) {
      misses.push({
        id: testCase.id,
        scenario: testCase.scenario,
        actionType: testCase.actionType,
        target: testCase.target,
        riskLevel: testCase.riskLevel,
        expected: testCase.expected,
        got: result.decision,
        matchedPolicy: result.matchedPolicy?.name ?? null,
        tags: testCase.tags ?? [],
      });
    }
  }

  const perClass = Object.fromEntries(
    DECISIONS.map((decision) => {
      const truePositive = confusion[decision][decision];
      const predicted = DECISIONS.reduce((sum, expected) => sum + confusion[expected][decision], 0);
      const actual = DECISIONS.reduce((sum, got) => sum + confusion[decision][got], 0);
      return [
        decision,
        {
          support: actual,
          predicted,
          correct: truePositive,
          precision: pct(truePositive, predicted),
          recall: pct(truePositive, actual),
        },
      ];
    }),
  ) as Record<Decision, { support: number; predicted: number; correct: number; precision: number | null; recall: number | null }>;

  const total = cases.length;
  const correct = DECISIONS.reduce((sum, decision) => sum + confusion[decision][decision], 0);
  const shouldAllow = perClass.allow.support;
  const shouldGate = perClass.deny.support + perClass.require_approval.support;
  const unsafeAllows = confusion.deny.allow + confusion.require_approval.allow;

  // Per tag, so edge cases cannot hide inside (or drag down) the headline.
  const tagNames = [...new Set(cases.flatMap((testCase) => testCase.tags?.length ? testCase.tags : ["ordinary"]))].sort();
  const byTag = Object.fromEntries(
    tagNames.map((tag) => {
      const inTag = cases.filter((testCase) =>
        tag === "ordinary" ? !testCase.tags?.length : testCase.tags?.includes(tag),
      );
      const right = inTag.filter((testCase) => evaluateAction(testCase, rules).decision === testCase.expected).length;
      const gated = inTag.filter((testCase) => testCase.expected !== "allow");
      const leaked = gated.filter((testCase) => evaluateAction(testCase, rules).decision === "allow").length;
      return [tag, { cases: inTag.length, correct: right, unsafeAllows: leaked, shouldBeGated: gated.length }];
    }),
  );

  return {
    cases: total,
    correct,
    byTag,
    accuracy: pct(correct, total),
    perClass,
    confusion,
    // Safe actions the engine blocked outright.
    falseBlock: { count: confusion.allow.deny, of: shouldAllow, rate: pct(confusion.allow.deny, shouldAllow) },
    // Safe actions the engine sent to a human unnecessarily.
    unnecessaryHold: {
      count: confusion.allow.require_approval,
      of: shouldAllow,
      rate: pct(confusion.allow.require_approval, shouldAllow),
    },
    // Actions that should have been denied or held but ran unreviewed.
    unsafeAllow: { count: unsafeAllows, of: shouldGate, rate: pct(unsafeAllows, shouldGate) },
    // Should-deny actions that were only held (a human still sees them).
    denyDowngradedToHold: { count: confusion.deny.require_approval, of: perClass.deny.support },
    misses,
  };
}

// ---------------------------------------------------------------- database helpers

const MIGRATIONS = path.join(ROOT, "src", "db", "migrations");

async function freshDatabase(): Promise<Database> {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: MIGRATIONS });
  return database;
}

async function seedOrg(database: Database, pack: PolicyPack) {
  const [org] = await database
    .insert(schema.organizations)
    .values({ name: "Kestrel Supply Co.", slug: `kestrel-${Math.random().toString(36).slice(2)}` })
    .returning();
  const { agent } = await createAgent(database, org!.id, { name: "eval-agent" });
  for (const policy of pack.policies) {
    const { briefRule: _rule, ...input } = policy;
    await createPolicy(database, org!.id, input, "user:eval");
  }
  return { orgId: org!.id, agentId: agent.id };
}

/** Replays every case through the real record path, then resolves approvals. */
async function populate(database: Database, pack: PolicyPack, cases: Case[]) {
  const { orgId, agentId } = await seedOrg(database, pack);
  const recorded: { caseId: string; decision: Decision; approvalId: string | null }[] = [];
  for (const testCase of cases) {
    const { action, approval } = await evaluateAndRecordAction(database, orgId, agentId, {
      actionType: testCase.actionType,
      target: testCase.target,
      riskLevel: testCase.riskLevel,
      context: { evalCase: testCase.id },
    });
    recorded.push({ caseId: testCase.id, decision: action.decision, approvalId: approval?.id ?? null });
  }
  let index = 0;
  for (const item of recorded) {
    if (!item.approvalId) continue;
    index += 1;
    if (index % 3 === 0) continue; // leave a third pending
    await decideApproval(database, orgId, item.approvalId, "eval_reviewer", {
      decision: index % 3 === 1 ? "approved" : "denied",
      reason: "eval",
    });
  }
  // End on a policy change, as a live org often does. Its event is the chain
  // head, and nothing in the actions table refers to it, so dropping it is
  // only visible against a checkpoint (see the truncate-tail scenario).
  const [catchAll] = await database
    .select()
    .from(schema.policies)
    .where(and(eq(schema.policies.orgId, orgId), eq(schema.policies.priority, 10000)));
  await updatePolicy(database, orgId, catchAll!.id, { name: "Hold any action outside the catalog" }, "user:eval");
  return { orgId, agentId, recorded };
}

async function withTriggerDisabled(database: Database, run: () => Promise<unknown>) {
  await database.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only`);
  try {
    await run();
  } finally {
    await database.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`);
  }
}

// ---------------------------------------------------------------- tamper suite

type Tamper = {
  id: string;
  description: string;
  /** "prevented": the database refuses the write. "detected": verification must flag it. */
  expectation: "prevented" | "detected" | "detected_with_checkpoint_only";
  apply: (database: Database, orgId: string) => Promise<void>;
};

const TAMPERS: Tamper[] = [
  {
    id: "update-blocked",
    description: "UPDATE an audit event through the application role",
    expectation: "prevented",
    apply: async (database, orgId) => {
      await database
        .update(schema.auditEvents)
        .set({ actor: "user:intruder" })
        .where(and(eq(schema.auditEvents.orgId, orgId), eq(schema.auditEvents.seq, 5)));
    },
  },
  {
    id: "delete-blocked",
    description: "DELETE an audit event through the application role",
    expectation: "prevented",
    apply: async (database, orgId) => {
      await database
        .delete(schema.auditEvents)
        .where(and(eq(schema.auditEvents.orgId, orgId), eq(schema.auditEvents.seq, 5)));
    },
  },
  {
    id: "edit-event-payload",
    description: "Owner disables the trigger and flips one recorded decision from deny to allow",
    expectation: "detected",
    apply: async (database, orgId) => {
      await withTriggerDisabled(database, () =>
        database.execute(sql`
          UPDATE audit_events SET payload = jsonb_set(payload, '{decision}', '"allow"')
          WHERE id = (SELECT id FROM audit_events WHERE org_id = ${orgId}
                      AND event_type = 'action.evaluated' AND payload->>'decision' = 'deny'
                      ORDER BY seq LIMIT 1)`),
      );
    },
  },
  {
    id: "edit-approver",
    description: "Owner rewrites who approved an action, recomputing that event's own hash",
    expectation: "detected",
    apply: async (database, orgId) => {
      const { computeEventHash } = await import("../src/lib/audit-chain");
      const { toStoredEvent } = await import("../src/lib/services/audit");
      const [row] = await database
        .select()
        .from(schema.auditEvents)
        .where(and(eq(schema.auditEvents.orgId, orgId), eq(schema.auditEvents.eventType, "approval.decided")))
        .orderBy(schema.auditEvents.seq)
        .limit(1);
      const stored = toStoredEvent(row!);
      const { hash: _old, ...record } = { ...stored, actor: "user:someone-else" };
      const hash = computeEventHash(record);
      await withTriggerDisabled(database, () =>
        database
          .update(schema.auditEvents)
          .set({ actor: "user:someone-else", hash })
          .where(eq(schema.auditEvents.id, row!.id)),
      );
    },
  },
  {
    id: "edit-timestamp",
    description: "Owner backdates one event",
    expectation: "detected",
    apply: async (database, orgId) => {
      await withTriggerDisabled(database, () =>
        database.execute(sql`
          UPDATE audit_events SET created_at = created_at - interval '3 days'
          WHERE org_id = ${orgId} AND seq = 20`),
      );
    },
  },
  {
    id: "delete-middle-event",
    description: "Owner deletes one event from the middle of the chain",
    expectation: "detected",
    apply: async (database, orgId) => {
      await withTriggerDisabled(database, () =>
        database.execute(sql`DELETE FROM audit_events WHERE org_id = ${orgId} AND seq = 30`),
      );
    },
  },
  {
    id: "swap-events",
    description: "Owner swaps the order of two adjacent events",
    expectation: "detected",
    apply: async (database, orgId) => {
      await withTriggerDisabled(database, async () => {
        await database.execute(sql`UPDATE audit_events SET seq = 2000000000 WHERE org_id = ${orgId} AND seq = 40`);
        await database.execute(sql`UPDATE audit_events SET seq = 40 WHERE org_id = ${orgId} AND seq = 41`);
        await database.execute(sql`UPDATE audit_events SET seq = 41 WHERE org_id = ${orgId} AND seq = 2000000000`);
      });
    },
  },
  {
    id: "edit-action-decision",
    description: "Edit actions.decision for a denied action to allow (actions has no trigger)",
    expectation: "detected",
    apply: async (database, orgId) => {
      await database.execute(sql`
        UPDATE actions SET decision = 'allow'
        WHERE id = (SELECT id FROM actions WHERE org_id = ${orgId} AND decision = 'deny' ORDER BY created_at LIMIT 1)`);
    },
  },
  {
    id: "edit-action-status",
    description: "Mark a still-pending action as approved without an approval event",
    expectation: "detected",
    apply: async (database, orgId) => {
      await database.execute(sql`
        UPDATE actions SET status = 'approved'
        WHERE id = (SELECT id FROM actions WHERE org_id = ${orgId} AND status = 'pending' ORDER BY created_at LIMIT 1)`);
    },
  },
  {
    id: "forge-action",
    description: "Insert an allowed action row that never went through evaluation",
    expectation: "detected",
    apply: async (database, orgId) => {
      const [agent] = await database.select().from(schema.agents).where(eq(schema.agents.orgId, orgId)).limit(1);
      await database.insert(schema.actions).values({
        orgId,
        agentId: agent!.id,
        actionType: "payment.payout",
        target: "acct:unknown",
        riskLevel: "low",
        decision: "allow",
      });
    },
  },
  {
    id: "truncate-tail",
    description: "Owner deletes the newest event (a policy change)",
    expectation: "detected_with_checkpoint_only",
    apply: async (database, orgId) => {
      const [head] = await database
        .select({ seq: schema.auditEvents.seq })
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.orgId, orgId))
        .orderBy(desc(schema.auditEvents.seq))
        .limit(1);
      await withTriggerDisabled(database, () =>
        database.execute(sql`DELETE FROM audit_events WHERE org_id = ${orgId} AND seq = ${head!.seq}`),
      );
    },
  },
  {
    id: "rewrite-suffix",
    description: "Owner edits a policy.created event and recomputes every later hash",
    expectation: "detected_with_checkpoint_only",
    apply: async (database, orgId) => {
      const { computeEventHash } = await import("../src/lib/audit-chain");
      const { toStoredEvent } = await import("../src/lib/services/audit");
      const rows = await database
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.orgId, orgId))
        .orderBy(schema.auditEvents.seq);
      let prevHash = rows[0]!.prevHash;
      const updates: { id: string; payload: Record<string, unknown>; prevHash: string; hash: string }[] = [];
      for (const row of rows) {
        const stored = toStoredEvent(row);
        const payload =
          stored.seq === 1
            ? { after: { ...(stored.payload.after as Record<string, unknown>), decision: "allow" } }
            : stored.payload;
        const { hash: _old, ...record } = { ...stored, payload, prevHash };
        const hash = computeEventHash(record);
        updates.push({ id: row.id, payload, prevHash, hash });
        prevHash = hash;
      }
      await withTriggerDisabled(database, async () => {
        for (const update of updates) {
          await database
            .update(schema.auditEvents)
            .set({ payload: update.payload, prevHash: update.prevHash, hash: update.hash })
            .where(eq(schema.auditEvents.id, update.id));
        }
      });
    },
  },
];

async function runTamperSuite(pack: PolicyPack, cases: Case[]) {
  const results = [];
  for (const tamper of TAMPERS) {
    const database = await freshDatabase();
    const { orgId } = await populate(database, pack, cases);
    const baseline = await verifyOrgAudit(database, orgId);
    if (!baseline.ok) throw new Error(`Baseline verification failed before ${tamper.id}`);
    const checkpoint = { seq: baseline.chain.headSeq, hash: baseline.chain.headHash };

    let writeRejected = false;
    try {
      await tamper.apply(database, orgId);
    } catch {
      writeRejected = true;
    }
    const without = await verifyOrgAudit(database, orgId);
    const withCheckpoint = await verifyOrgAudit(database, orgId, checkpoint);
    const kinds = [
      ...new Set([
        ...withCheckpoint.chain.failures.map((failure) => failure.kind),
        ...withCheckpoint.actions.failures.map((failure) => failure.kind),
      ]),
    ].sort();

    const outcome = writeRejected
      ? "prevented"
      : !without.ok
        ? "detected"
        : !withCheckpoint.ok
          ? "detected_with_checkpoint_only"
          : "undetected";

    results.push({
      id: tamper.id,
      description: tamper.description,
      expected: tamper.expectation,
      outcome,
      asExpected: outcome === tamper.expectation,
      failureKinds: kinds,
      eventsInChain: baseline.chain.checked,
    });
  }
  return results;
}

// ---------------------------------------------------------------- latency

async function measureLatency(pack: PolicyPack, cases: Case[]) {
  const rules: PolicyRule[] = pack.policies.map((policy, index) => ({ ...policy, id: `p${index}` }));

  // Engine only: the pure decision function, per call.
  for (let warm = 0; warm < 2000; warm += 1) evaluateAction(cases[warm % cases.length]!, rules);
  const engineMicros: number[] = [];
  for (let round = 0; round < 200; round += 1) {
    for (const testCase of cases) {
      const started = performance.now();
      evaluateAction(testCase, rules);
      engineMicros.push((performance.now() - started) * 1000);
    }
  }

  // Full record path: load policies, decide, insert action (+ approval) and
  // append the audit event in one transaction, on in-process PGlite.
  const database = await freshDatabase();
  const { orgId, agentId } = await seedOrg(database, pack);
  const fullMillis: number[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (const testCase of cases) {
      const started = performance.now();
      await evaluateAndRecordAction(database, orgId, agentId, testCase);
      if (round > 0) fullMillis.push(performance.now() - started); // round 0 is warm-up
    }
  }

  const verifyStarted = performance.now();
  const verification = await verifyOrgAudit(database, orgId);
  const verifyMillis = performance.now() - verifyStarted;

  return {
    policiesLoaded: rules.length,
    engineMicroseconds: summarize(engineMicros, 2),
    recordPathMilliseconds: summarize(fullMillis, 3),
    verifyFullChain: {
      events: verification.chain.checked,
      actions: verification.actions.checked,
      milliseconds: Number(verifyMillis.toFixed(1)),
      ok: verification.ok,
    },
  };
}

// ---------------------------------------------------------------- main

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const packText = readText("policies/reference.json");
  const pack = JSON.parse(packText) as PolicyPack;
  const rules: PolicyRule[] = pack.policies.map((policy, index) => ({ ...policy, id: `p${index}` }));
  const splits = { dev: "cases/dev.jsonl", test: "cases/test.jsonl" } as const;
  const dev = loadCases(splits.dev);
  const test = loadCases(splits.test);

  const classification = { dev: score(dev, rules), test: score(test, rules) };

  // The record path must reach the same decision as the pure engine.
  const database = await freshDatabase();
  const populated = await populate(database, pack, [...dev, ...test]);
  const expectedByCase = new Map([...dev, ...test].map((testCase) => [testCase.id, evaluateAction(testCase, rules).decision]));
  const pathMismatches = populated.recorded.filter((item) => expectedByCase.get(item.caseId) !== item.decision).length;
  const endToEnd = await verifyOrgAudit(database, populated.orgId);

  const tamper = await runTamperSuite(pack, [...dev, ...test]);

  const deterministic = {
    inputs: {
      policyPack: { file: "eval/policies/reference.json", sha256: sha256(packText), policies: rules.length },
      dev: { file: `eval/${splits.dev}`, sha256: sha256(readText(splits.dev)), cases: dev.length },
      test: { file: `eval/${splits.test}`, sha256: sha256(readText(splits.test)), cases: test.length },
    },
    classification,
    recordPath: {
      cases: populated.recorded.length,
      decisionsDifferingFromEngine: pathMismatches,
      chainVerified: endToEnd.ok,
      eventsInChain: endToEnd.chain.checked,
    },
    tamper,
  };

  if (check) {
    const saved = JSON.parse(readFileSync(RESULTS_JSON, "utf8"));
    const want = JSON.stringify(saved.deterministic);
    const got = JSON.stringify(deterministic);
    if (want !== got) {
      console.error("eval:check FAILED: deterministic results differ from eval/results/latest.json.");
      console.error("Run `pnpm eval` and review the diff.");
      process.exit(1);
    }
    console.log("eval:check passed: decisions, metrics and tamper outcomes match eval/results/latest.json.");
    return;
  }

  const latency = await measureLatency(pack, [...dev, ...test]);
  const cpus = os.cpus();
  const results = {
    generatedAt: new Date().toISOString(),
    commit: gitCommit(),
    environment: {
      node: process.version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: `${cpus[0]?.model ?? "unknown"} (${cpus.length} logical cores)`,
      database: "PGlite (in-process Postgres, WASM)",
    },
    deterministic,
    latency,
  };
  writeFileSync(RESULTS_JSON, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(RESULTS_MD, renderMarkdown(results));
  console.log(renderMarkdown(results));
}

// ---------------------------------------------------------------- report

type Results = {
  generatedAt: string;
  commit: string | null;
  environment: Record<string, string>;
  deterministic: {
    inputs: Record<string, { file: string; sha256: string } & Record<string, unknown>>;
    classification: Record<"dev" | "test", ReturnType<typeof score>>;
    recordPath: { cases: number; decisionsDifferingFromEngine: number; chainVerified: boolean; eventsInChain: number };
    tamper: Awaited<ReturnType<typeof runTamperSuite>>;
  };
  latency: Awaited<ReturnType<typeof measureLatency>>;
};

function fmt(value: number | null) {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function renderMarkdown(results: Results) {
  const { classification, recordPath, tamper, inputs } = results.deterministic;
  const lines: string[] = [];
  lines.push("<!-- Generated by `pnpm eval` (eval/run.ts). Do not edit by hand. -->", "");
  lines.push("# Eval results", "");
  lines.push(
    `Generated ${results.generatedAt} at commit \`${results.commit ?? "unknown"}\`. Method and case provenance: [eval/README.md](README.md).`,
    "",
  );
  const heldout = JSON.parse(readFileSync(HELDOUT_JSON, "utf8")) as Results;
  const firstRun = heldout.deterministic.classification.test;
  const testChanged = JSON.stringify(firstRun) !== JSON.stringify(classification.test);
  const row = (label: string, c: ReturnType<typeof score>) =>
    `| ${label} | ${c.cases} | ${c.correct} (${fmt(c.accuracy)}) | ${c.unsafeAllow.count}/${c.unsafeAllow.of} (${fmt(c.unsafeAllow.rate)}) | ${c.falseBlock.count}/${c.falseBlock.of} (${fmt(c.falseBlock.rate)}) | ${c.unnecessaryHold.count}/${c.unnecessaryHold.of} (${fmt(c.unnecessaryHold.rate)}) |`;
  lines.push("## Decisions", "");
  lines.push("| Split | Cases | Correct | Unsafe allows | False blocks | Unnecessary holds |");
  lines.push("| :--- | ---: | ---: | ---: | ---: | ---: |");
  lines.push(row("dev (policy pack tuned here)", classification.dev));
  lines.push(row(`**held-out test, first run** (commit \`${heldout.commit}\`)`, firstRun));
  if (testChanged) lines.push(row("test, current engine (post-hoc, not held-out)", classification.test));
  lines.push("");
  if (testChanged) {
    lines.push(
      "The engine changed after the held-out split was first scored, in response to its misses (see [eval/README.md](README.md#changes-after-the-held-out-run)). The first-run row is the held-out result; the current-engine row shows the effect of the change on the same cases and is not an independent estimate.",
      "",
    );
  }
  for (const split of ["dev", "test"] as const) {
    const c = classification[split];
    lines.push(`### Per decision, ${split}`, "");
    lines.push("| Decision | Support | Precision | Recall |");
    lines.push("| :--- | ---: | ---: | ---: |");
    for (const decision of DECISIONS) {
      const k = c.perClass[decision];
      lines.push(
        `| \`${decision}\` | ${k.support} | ${k.correct}/${k.predicted} (${fmt(k.precision)}) | ${k.correct}/${k.support} (${fmt(k.recall)}) |`,
      );
    }
    lines.push("", "By case type:", "");
    lines.push("| Case type | Cases | Correct | Unsafe allows |", "| :--- | ---: | ---: | ---: |");
    for (const [tag, t] of Object.entries(c.byTag)) {
      lines.push(`| ${tag} | ${t.cases} | ${t.correct} | ${t.unsafeAllows}/${t.shouldBeGated} |`);
    }
    lines.push("", "Confusion (rows: expected, columns: engine):", "");
    lines.push("| | allow | deny | require_approval |", "| :--- | ---: | ---: | ---: |");
    for (const expected of DECISIONS) {
      lines.push(
        `| **${expected}** | ${DECISIONS.map((got) => c.confusion[expected][got]).join(" | ")} |`,
      );
    }
    lines.push("");
    if (c.misses.length > 0) {
      lines.push(`Misses (${c.misses.length}):`, "");
      lines.push("| Case | Action | Target | Agent risk | Expected | Engine | Matched policy |");
      lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
      for (const miss of c.misses) {
        lines.push(
          `| ${miss.id} | \`${miss.actionType}\` | \`${miss.target}\` | ${miss.riskLevel} | ${miss.expected} | ${miss.got} | ${miss.matchedPolicy ?? "default"} |`,
        );
      }
      lines.push("");
    }
  }
  lines.push("## Record path", "");
  lines.push(
    `All ${recordPath.cases} cases were replayed through \`evaluateAndRecordAction\` on PGlite with the same policies loaded from the database. Decisions differing from the pure engine: **${recordPath.decisionsDifferingFromEngine}**. Chain after replay and approvals: **${recordPath.chainVerified ? "verified" : "FAILED"}** (${recordPath.eventsInChain} events).`,
    "",
  );
  lines.push("## Audit tamper suite", "");
  const asExpected = tamper.filter((t) => t.asExpected).length;
  lines.push(`${asExpected}/${tamper.length} scenarios behaved as designed.`, "");
  lines.push("| Scenario | Designed outcome | Observed | Failure kinds reported |");
  lines.push("| :--- | :--- | :--- | :--- |");
  for (const t of tamper) {
    lines.push(
      `| ${t.description} | ${t.expected.replaceAll("_", " ")} | ${t.asExpected ? "" : "**"}${t.outcome.replaceAll("_", " ")}${t.asExpected ? "" : "**"} | ${t.failureKinds.join(", ") || "none"} |`,
    );
  }
  lines.push("");
  const l = results.latency;
  lines.push("## Latency", "");
  lines.push(
    `Machine: ${results.environment.cpu}, ${results.environment.platform}, Node ${results.environment.node}. Database: ${results.environment.database}. No network hop is included; a hosted deployment adds the round trip to Gatekit and to Postgres.`,
    "",
  );
  lines.push("| Measurement | n | Median | p95 | p99 | Max |", "| :--- | ---: | ---: | ---: | ---: | ---: |");
  const e = l.engineMicroseconds;
  lines.push(`| Policy engine only, ${l.policiesLoaded} policies (µs) | ${e.n} | ${e.median} | ${e.p95} | ${e.p99} | ${e.max} |`);
  const r = l.recordPathMilliseconds;
  lines.push(`| Full record path incl. audit append (ms) | ${r.n} | ${r.median} | ${r.p95} | ${r.p99} | ${r.max} |`);
  lines.push("");
  lines.push(
    `Verifying the whole chain (${l.verifyFullChain.events} events, ${l.verifyFullChain.actions} actions cross-checked) took ${l.verifyFullChain.milliseconds} ms.`,
    "",
  );
  lines.push("## Inputs", "");
  for (const [name, input] of Object.entries(inputs)) {
    lines.push(`- ${name}: \`${input.file}\` sha256 \`${input.sha256.slice(0, 16)}…\``);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
