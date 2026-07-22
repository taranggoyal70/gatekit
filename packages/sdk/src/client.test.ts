import { describe, expect, it, vi } from "vitest";

import { GatekitClient } from "./client";
import { GatekitApiError, GatekitDeniedError } from "./errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

describe("GatekitClient construction", () => {
  it("throws when constructed without an apiKey", () => {
    // @ts-expect-error — intentionally missing required field
    expect(() => new GatekitClient({})).toThrow();
  });
});

describe("GatekitClient.evaluate", () => {
  it("sends the Authorization header and parses a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        actionId: "a1",
        decision: "allow",
        status: "resolved",
        reason: "ok",
        approvalId: null,
        expiresAt: null,
      }),
    );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const result = await client.evaluate({
      actionType: "email.send",
      target: "x@y.com",
    });

    expect(result.decision).toBe("allow");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toContain("/api/v1/evaluate");
    const init = call?.[1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer gk_test");
  });

  it("throws GatekitApiError with the parsed message and code on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: "Invalid agent key.", code: "unauthorized" } },
          401,
        ),
      );
    const client = new GatekitClient({ apiKey: "gk_bad", fetch: fetchMock });

    await expect(
      client.evaluate({ actionType: "x", target: "y" }),
    ).rejects.toMatchObject({
      message: "Invalid agent key.",
      status: 401,
      code: "unauthorized",
    });
  });

  it("handles a 204 No Content response without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse());
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });
    // getActionStatus never returns 204 in practice, but request() is shared
    // plumbing — exercise it directly via a method that can hit this path.
    await expect(
      (client as unknown as { request: (p: string, i: RequestInit) => Promise<unknown> }).request(
        "/whatever",
        { method: "GET" },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("GatekitClient.waitForApproval", () => {
  it("returns immediately once status leaves pending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "approved",
          approval: { id: "ap1", status: "approved", reason: null },
        }),
      );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const result = await client.waitForApproval("a1", { pollIntervalMs: 1 });
    expect(result.status).toBe("approved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls repeatedly while pending, then returns the resolved status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ actionId: "a1", decision: "require_approval", status: "pending", approval: null }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ actionId: "a1", decision: "require_approval", status: "pending", approval: null }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "denied",
          approval: { id: "ap1", status: "denied", reason: "not today" },
        }),
      );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const result = await client.waitForApproval("a1", { pollIntervalMs: 1 });
    expect(result.status).toBe("denied");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns the still-pending status once the timeout elapses", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({ actionId: "a1", decision: "require_approval", status: "pending", approval: null }),
    );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const result = await client.waitForApproval("a1", {
      timeoutMs: 5,
      pollIntervalMs: 3,
    });
    expect(result.status).toBe("pending");
  });
});

describe("GatekitClient.guard", () => {
  it("executes immediately when the decision is allow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        actionId: "a1",
        decision: "allow",
        status: "resolved",
        reason: "ok",
        approvalId: null,
        expiresAt: null,
      }),
    );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });
    const execute = vi.fn().mockResolvedValue("done");

    const result = await client.guard(
      { actionType: "x", target: "y" },
      execute,
    );

    expect(result).toBe("done");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GatekitDeniedError without executing when the decision is deny", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        actionId: "a1",
        decision: "deny",
        status: "resolved",
        reason: "blocked by policy",
        approvalId: null,
        expiresAt: null,
      }),
    );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });
    const execute = vi.fn();

    await expect(
      client.guard({ actionType: "x", target: "y" }, execute),
    ).rejects.toBeInstanceOf(GatekitDeniedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes after the approval resolves to approved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "pending",
          reason: "held for review",
          approvalId: "ap1",
          expiresAt: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "approved",
          approval: { id: "ap1", status: "approved", reason: null },
        }),
      );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });
    const execute = vi.fn().mockResolvedValue(42);

    const result = await client.guard(
      { actionType: "x", target: "y" },
      execute,
      { pollIntervalMs: 1 },
    );

    expect(result).toBe(42);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("throws GatekitDeniedError with reason approval_denied when a human denies it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "pending",
          reason: "held for review",
          approvalId: "ap1",
          expiresAt: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "denied",
          approval: { id: "ap1", status: "denied", reason: "too risky" },
        }),
      );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });
    const execute = vi.fn();

    const error = await client
      .guard({ actionType: "x", target: "y" }, execute, { pollIntervalMs: 1 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(GatekitDeniedError);
    expect(error.reason).toBe("approval_denied");
    expect(execute).not.toHaveBeenCalled();
  });

  it("throws GatekitDeniedError with reason approval_expired when the window lapses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "pending",
          reason: "held for review",
          approvalId: "ap1",
          expiresAt: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          actionId: "a1",
          decision: "require_approval",
          status: "expired",
          approval: { id: "ap1", status: "expired", reason: null },
        }),
      );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const error = await client
      .guard({ actionType: "x", target: "y" }, vi.fn(), { pollIntervalMs: 1 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(GatekitDeniedError);
    expect(error.reason).toBe("approval_expired");
  });

  it("throws GatekitDeniedError with reason timeout when the wait never resolves", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({
        actionId: "a1",
        decision: "require_approval",
        status: "pending",
        approval: null,
      }),
    );
    const client = new GatekitClient({ apiKey: "gk_test", fetch: fetchMock });

    const error = await client
      .guard({ actionType: "x", target: "y" }, vi.fn(), {
        timeoutMs: 5,
        pollIntervalMs: 3,
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(GatekitDeniedError);
    expect(error.reason).toBe("timeout");
  });
});

describe("GatekitApiError", () => {
  it("carries status and code as fields", () => {
    const error = new GatekitApiError("nope", 403, "forbidden");
    expect(error.status).toBe(403);
    expect(error.code).toBe("forbidden");
    expect(error.name).toBe("GatekitApiError");
  });
});
