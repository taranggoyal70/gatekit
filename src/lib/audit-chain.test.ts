import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  computeEventHash,
  GENESIS_HASH,
  verifyChain,
  type AuditRecord,
  type StoredAuditEvent,
} from "./audit-chain";

const ORG = "00000000-0000-4000-8000-000000000001";

function buildChain(length: number, orgId = ORG): StoredAuditEvent[] {
  const events: StoredAuditEvent[] = [];
  let prevHash = GENESIS_HASH;
  for (let seq = 1; seq <= length; seq += 1) {
    const record: AuditRecord = {
      orgId,
      seq,
      eventType: "action.evaluated",
      actionId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      actor: "agent:test",
      payload: { decision: seq % 2 === 0 ? "deny" : "allow", target: `t${seq}` },
      prevHash,
      createdAt: new Date(Date.UTC(2026, 10, 19, 0, 0, seq)).toISOString(),
    };
    const hash = computeEventHash(record);
    events.push({ ...record, hash });
    prevHash = hash;
  }
  return events;
}

/** Recompute one event's hash after editing it, as a careful attacker would. */
function rehash(event: StoredAuditEvent): StoredAuditEvent {
  const { hash: _old, ...record } = event;
  return { ...record, hash: computeEventHash(record) };
}

describe("canonicalJson", () => {
  it("sorts keys at every depth so jsonb key reordering cannot change a hash", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("drops undefined members like JSON.stringify and keeps array positions", () => {
    expect(canonicalJson({ a: undefined, b: [undefined, 1] })).toBe('{"b":[null,1]}');
  });

  it("escapes strings exactly as JSON does", () => {
    expect(canonicalJson({ "k\"ey": "line\nbreak " })).toBe(JSON.stringify({ "k\"ey": "line\nbreak " }));
  });

  it("rejects values JSON cannot round-trip", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});

describe("verifyChain", () => {
  it("accepts an untouched chain and reports its head", () => {
    const chain = buildChain(5);
    const result = verifyChain(ORG, chain);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(5);
    expect(result.headSeq).toBe(5);
    expect(result.headHash).toBe(chain[4]!.hash);
  });

  it("accepts an empty chain with the genesis head", () => {
    expect(verifyChain(ORG, [])).toMatchObject({ ok: true, headSeq: 0, headHash: GENESIS_HASH });
  });

  it("verifies regardless of input order", () => {
    expect(verifyChain(ORG, buildChain(4).reverse()).ok).toBe(true);
  });

  it("detects an edited payload", () => {
    const chain = buildChain(5);
    chain[2] = { ...chain[2]!, payload: { ...chain[2]!.payload, decision: "require_approval" } };
    const result = verifyChain(ORG, chain);
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(expect.objectContaining({ seq: 3, kind: "hash_mismatch" }));
  });

  it("detects an edited event whose own hash was recomputed, at the next link", () => {
    const chain = buildChain(5);
    chain[2] = rehash({ ...chain[2]!, actor: "user:someone-else" });
    const result = verifyChain(ORG, chain);
    expect(result.failures).toEqual([expect.objectContaining({ seq: 4, kind: "prev_hash_mismatch" })]);
  });

  it("detects a deleted middle event", () => {
    const chain = buildChain(5);
    chain.splice(2, 1);
    const kinds = verifyChain(ORG, chain).failures.map((failure) => failure.kind);
    expect(kinds).toEqual(expect.arrayContaining(["seq_gap", "prev_hash_mismatch"]));
  });

  it("detects two events swapped in place", () => {
    const chain = buildChain(5);
    const a = chain[1]!;
    const b = chain[2]!;
    chain[1] = { ...b, seq: 2 };
    chain[2] = { ...a, seq: 3 };
    expect(verifyChain(ORG, chain).ok).toBe(false);
  });

  it("detects an edited timestamp", () => {
    const chain = buildChain(3);
    chain[0] = { ...chain[0]!, createdAt: "2020-01-01T00:00:00.000Z" };
    expect(verifyChain(ORG, chain).failures[0]).toMatchObject({ seq: 1, kind: "hash_mismatch" });
  });

  it("detects an event copied in from another organization", () => {
    const chain = buildChain(3);
    const foreign = buildChain(3, "00000000-0000-4000-8000-000000000002");
    chain[2] = foreign[2]!;
    const kinds = verifyChain(ORG, chain).failures.map((failure) => failure.kind);
    expect(kinds).toContain("wrong_org");
  });

  it("cannot see a dropped newest event without a checkpoint", () => {
    // Documented limit: the chain alone proves consistency, not completeness.
    const chain = buildChain(5);
    expect(verifyChain(ORG, chain.slice(0, 4)).ok).toBe(true);
  });

  it("detects truncation and full rewrites against a stored checkpoint", () => {
    const chain = buildChain(5);
    const checkpoint = { seq: 5, hash: chain[4]!.hash };
    expect(verifyChain(ORG, chain, checkpoint).ok).toBe(true);

    expect(verifyChain(ORG, chain.slice(0, 4), checkpoint).failures).toEqual([
      expect.objectContaining({ kind: "checkpoint_missing" }),
    ]);

    // Rewrite event 3 and re-chain everything after it consistently.
    const rewritten = chain.slice(0, 2);
    let prev = rewritten[1]!.hash;
    for (const event of chain.slice(2)) {
      const next = rehash({ ...event, prevHash: prev, payload: { ...event.payload, decision: "allow" } });
      rewritten.push(next);
      prev = next.hash;
    }
    expect(verifyChain(ORG, rewritten).ok).toBe(true);
    expect(verifyChain(ORG, rewritten, checkpoint).failures).toEqual([
      expect.objectContaining({ kind: "checkpoint_mismatch" }),
    ]);
  });
});
