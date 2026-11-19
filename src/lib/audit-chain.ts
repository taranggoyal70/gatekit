import { createHash } from "node:crypto";

/**
 * Tamper evidence for the audit log.
 *
 * Every governance event (an action evaluated, an approval decided or
 * expired, a policy changed) is appended to `audit_events` as one link of a
 * per-organization hash chain:
 *
 *   hash = SHA-256( prevHash || "\n" || canonicalJson(record) )
 *
 * where `record` holds every stored field except `hash` itself. Changing,
 * reordering or removing any event changes a hash that a later event commits
 * to, so `verifyChain` reports where the history stops being consistent.
 *
 * What this does not do on its own: an attacker with write access to the
 * database can rewrite the whole chain from some point onward and recompute
 * every hash, or drop the newest events. Comparing against a checkpoint
 * (a `{ seq, hash }` the org recorded somewhere else earlier) catches both up
 * to that checkpoint. Signing checkpoints with a key outside the database is
 * the next step; see SECURITY.md.
 *
 * This module is pure (no database), so the eval harness and tests can check
 * chains directly.
 */

export const GENESIS_HASH = "0".repeat(64);

export type AuditEventType =
  | "action.evaluated"
  | "approval.decided"
  | "approval.expired"
  | "policy.created"
  | "policy.updated"
  | "policy.deleted";

/** Everything that is hashed: all stored fields except `id` and `hash`. */
export type AuditRecord = {
  orgId: string;
  seq: number;
  eventType: AuditEventType;
  actionId: string | null;
  actor: string;
  payload: Record<string, unknown>;
  prevHash: string;
  createdAt: string;
};

export type StoredAuditEvent = AuditRecord & { hash: string };

/**
 * Deterministic JSON: object keys sorted at every depth, no whitespace,
 * `undefined` object members dropped (as JSON.stringify does). Postgres
 * `jsonb` does not preserve key order, so hashing plain JSON.stringify output
 * would make a chain unverifiable after one round trip through the database.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("canonicalJson: non-finite numbers are not representable.");
    }
    if (typeof value === "bigint") {
      throw new TypeError("canonicalJson: bigint is not representable.");
    }
    return JSON.stringify(value) ?? "null";
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeEventHash(record: AuditRecord): string {
  return sha256Hex(`${record.prevHash}\n${canonicalJson(record)}`);
}

export type ChainFailureKind =
  | "seq_gap"
  | "prev_hash_mismatch"
  | "hash_mismatch"
  | "wrong_org"
  | "checkpoint_missing"
  | "checkpoint_mismatch";

export type ChainFailure = { seq: number; kind: ChainFailureKind; detail: string };

export type Checkpoint = { seq: number; hash: string };

export type ChainVerification = {
  ok: boolean;
  checked: number;
  headSeq: number;
  headHash: string;
  failures: ChainFailure[];
};

/**
 * Verify one organization's chain. `events` may arrive in any order; they
 * are checked in `seq` order. Every failure is reported, not just the first,
 * so an investigator sees the full extent of the damage.
 */
export function verifyChain(
  orgId: string,
  events: readonly StoredAuditEvent[],
  checkpoint?: Checkpoint,
): ChainVerification {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const failures: ChainFailure[] = [];
  let expectedSeq = 1;
  let prevHash = GENESIS_HASH;

  for (const event of sorted) {
    if (event.orgId !== orgId) {
      failures.push({ seq: event.seq, kind: "wrong_org", detail: "Event belongs to another organization." });
    }
    if (event.seq !== expectedSeq) {
      failures.push({
        seq: event.seq,
        kind: "seq_gap",
        detail: `Expected seq ${expectedSeq}, found ${event.seq}.`,
      });
    }
    if (event.prevHash !== prevHash) {
      failures.push({
        seq: event.seq,
        kind: "prev_hash_mismatch",
        detail: "prevHash does not equal the previous event's hash.",
      });
    }
    const { hash, ...record } = event;
    if (computeEventHash(record) !== hash) {
      failures.push({
        seq: event.seq,
        kind: "hash_mismatch",
        detail: "Stored hash does not match the event's contents.",
      });
    }
    expectedSeq = event.seq + 1;
    prevHash = hash;
  }

  if (checkpoint) {
    const anchored = sorted.find((event) => event.seq === checkpoint.seq);
    if (!anchored) {
      failures.push({
        seq: checkpoint.seq,
        kind: "checkpoint_missing",
        detail: "The checkpointed event is no longer in the log (history was truncated).",
      });
    } else if (anchored.hash !== checkpoint.hash) {
      failures.push({
        seq: checkpoint.seq,
        kind: "checkpoint_mismatch",
        detail: "The checkpointed event's hash changed (history was rewritten).",
      });
    }
  }

  const head = sorted.at(-1);
  return {
    ok: failures.length === 0,
    checked: sorted.length,
    headSeq: head?.seq ?? 0,
    headHash: head?.hash ?? GENESIS_HASH,
    failures,
  };
}
