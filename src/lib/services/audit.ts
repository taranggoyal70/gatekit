import "server-only";

import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import { actions, auditEvents, type AuditEvent } from "@/db/schema";
import {
  computeEventHash,
  GENESIS_HASH,
  verifyChain,
  type AuditEventType,
  type ChainFailure,
  type Checkpoint,
  type StoredAuditEvent,
} from "@/lib/audit-chain";
import type { Database } from "@/lib/services/types";

export type AppendAuditInput = {
  eventType: AuditEventType;
  actionId?: string | null;
  actor: string;
  payload: Record<string, unknown>;
};

/**
 * Append one event to an organization's chain. MUST be called inside a
 * transaction (`database.transaction(tx => appendAuditEvent(tx, …))`): the
 * advisory lock is transaction-scoped, and it is what serializes concurrent
 * appends for one org so two writers can never both claim the same `seq`.
 * The unique (org_id, seq) index is the backstop if a caller forgets.
 */
export async function appendAuditEvent(
  tx: Database,
  orgId: string,
  input: AppendAuditInput,
): Promise<AuditEvent> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${orgId}, 0))`);

  const [last] = await tx
    .select({ seq: auditEvents.seq, hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.seq))
    .limit(1);

  const createdAt = new Date();
  const record = {
    orgId,
    seq: (last?.seq ?? 0) + 1,
    eventType: input.eventType,
    actionId: input.actionId ?? null,
    actor: input.actor,
    payload: input.payload,
    prevHash: last?.hash ?? GENESIS_HASH,
    createdAt: createdAt.toISOString(),
  };
  const hash = computeEventHash(record);

  const [event] = await tx
    .insert(auditEvents)
    .values({ ...record, createdAt, hash })
    .returning();
  if (!event) throw new Error("Failed to append audit event.");
  return event;
}

export function toStoredEvent(row: AuditEvent): StoredAuditEvent {
  return {
    orgId: row.orgId,
    seq: row.seq,
    eventType: row.eventType as StoredAuditEvent["eventType"],
    actionId: row.actionId,
    actor: row.actor,
    payload: row.payload,
    prevHash: row.prevHash,
    createdAt: row.createdAt.toISOString(),
    hash: row.hash,
  };
}

export async function listAuditEvents(
  database: Database,
  orgId: string,
  options: { afterSeq?: number; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  return database
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.orgId, orgId), gt(auditEvents.seq, options.afterSeq ?? 0)))
    .orderBy(asc(auditEvents.seq))
    .limit(limit);
}

export type ActionCrossCheckFailure = {
  actionId: string;
  kind: "missing_evaluation_event" | "duplicate_evaluation_event" | "decision_mismatch" | "status_mismatch";
  detail: string;
};

export type AuditVerification = {
  ok: boolean;
  chain: {
    ok: boolean;
    checked: number;
    headSeq: number;
    headHash: string;
    failures: ChainFailure[];
  };
  actions: { checked: number; failures: ActionCrossCheckFailure[] };
  verifiedAt: string;
};

const EVALUATED_FIELDS = ["actionType", "target", "riskLevel", "decision", "agentId"] as const;

/**
 * Full integrity check for one organization:
 * 1. the hash chain is internally consistent (and matches `checkpoint`, if
 *    one is supplied), and
 * 2. every row in the mutable `actions` table agrees with the chain: it has
 *    exactly one `action.evaluated` event with the same type, target, risk,
 *    decision and agent, and its current status is the one the chain's
 *    approval events imply.
 *
 * (2) is what catches someone editing `actions.decision` directly in SQL to
 * make a denied action look allowed after the fact.
 *
 * Loads the whole org's chain into memory. Fine at today's scale (an event is
 * a few hundred bytes); incremental verification from the last verified
 * checkpoint is the path past ~10^6 events per org.
 */
export async function verifyOrgAudit(
  database: Database,
  orgId: string,
  checkpoint?: Checkpoint,
): Promise<AuditVerification> {
  const rows = await database
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(asc(auditEvents.seq));
  const chain = verifyChain(orgId, rows.map(toStoredEvent), checkpoint);

  const evaluated = new Map<string, AuditEvent[]>();
  const terminal = new Map<string, string>();
  for (const row of rows) {
    if (!row.actionId) continue;
    if (row.eventType === "action.evaluated") {
      evaluated.set(row.actionId, [...(evaluated.get(row.actionId) ?? []), row]);
    } else if (row.eventType === "approval.decided") {
      terminal.set(row.actionId, String(row.payload.decision));
    } else if (row.eventType === "approval.expired") {
      terminal.set(row.actionId, "expired");
    }
  }

  const actionRows = await database.select().from(actions).where(eq(actions.orgId, orgId));
  const failures: ActionCrossCheckFailure[] = [];
  for (const action of actionRows) {
    const events = evaluated.get(action.id) ?? [];
    if (events.length === 0) {
      failures.push({
        actionId: action.id,
        kind: "missing_evaluation_event",
        detail: "Action has no action.evaluated event in the chain.",
      });
      continue;
    }
    if (events.length > 1) {
      failures.push({
        actionId: action.id,
        kind: "duplicate_evaluation_event",
        detail: `Action has ${events.length} action.evaluated events.`,
      });
    }
    const payload = events[0]!.payload;
    const mismatched = EVALUATED_FIELDS.filter(
      (field) => payload[field] !== (field === "agentId" ? action.agentId : action[field]),
    );
    if (mismatched.length > 0) {
      failures.push({
        actionId: action.id,
        kind: "decision_mismatch",
        detail: `actions row differs from its audit record in: ${mismatched.join(", ")}.`,
      });
    }

    const expectedStatus =
      terminal.get(action.id) ?? (payload.decision === "require_approval" ? "pending" : "resolved");
    if (action.status !== expectedStatus) {
      failures.push({
        actionId: action.id,
        kind: "status_mismatch",
        detail: `actions.status is "${action.status}" but the chain implies "${expectedStatus}".`,
      });
    }
  }

  return {
    ok: chain.ok && failures.length === 0,
    chain,
    actions: { checked: actionRows.length, failures },
    verifiedAt: new Date().toISOString(),
  };
}
