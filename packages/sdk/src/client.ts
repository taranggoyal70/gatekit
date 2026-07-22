import { GatekitApiError, GatekitDeniedError } from "./errors";
import type {
  ActionStatusResult,
  EvaluateInput,
  EvaluateResult,
  GatekitClientOptions,
  WaitForApprovalOptions,
} from "./types";

const DEFAULT_BASE_URL = "https://api.gatekit.dev";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GatekitClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GatekitClientOptions) {
    if (!options.apiKey) {
      throw new Error("GatekitClient requires an apiKey.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.error?.message ?? `Request failed with status ${response.status}.`;
      const code = body?.error?.code ?? "unknown_error";
      throw new GatekitApiError(message, response.status, code);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** Evaluate a proposed action against the org's policies. Never throws on
   * a "deny" or "require_approval" decision — those are valid outcomes the
   * caller inspects. Use guard() if you want denial to short-circuit as a
   * thrown error instead. */
  async evaluate(input: EvaluateInput): Promise<EvaluateResult> {
    return this.request<EvaluateResult>("/api/v1/evaluate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getActionStatus(actionId: string): Promise<ActionStatusResult> {
    return this.request<ActionStatusResult>(`/api/v1/actions/${actionId}`, {
      method: "GET",
    });
  }

  /** Polls until the action leaves "pending", or the timeout elapses — in
   * which case the last-seen (still pending) status is returned rather than
   * throwing, so the caller decides how to treat an unresolved wait. */
  async waitForApproval(
    actionId: string,
    options: WaitForApprovalOptions = {},
  ): Promise<ActionStatusResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const status = await this.getActionStatus(actionId);
      if (status.status !== "pending") return status;
      if (Date.now() >= deadline) return status;
      await sleep(pollIntervalMs);
    }
  }

  /**
   * Evaluate an action and only run `execute` if it is (or becomes, after
   * approval) permitted. Throws GatekitDeniedError for every path where
   * execute must not run, so a caller that doesn't catch it fails loudly
   * instead of silently skipping the guarded side effect.
   */
  async guard<T>(
    input: EvaluateInput,
    execute: () => Promise<T> | T,
    options: WaitForApprovalOptions = {},
  ): Promise<T> {
    const evaluation = await this.evaluate(input);

    if (evaluation.decision === "deny") {
      throw new GatekitDeniedError(
        evaluation.reason,
        "denied",
        evaluation.actionId,
      );
    }

    if (evaluation.decision === "allow") {
      return await execute();
    }

    const resolved = await this.waitForApproval(evaluation.actionId, options);

    if (resolved.status === "approved") return await execute();
    if (resolved.status === "denied") {
      throw new GatekitDeniedError(
        resolved.approval?.reason ?? "Denied by an approver.",
        "approval_denied",
        evaluation.actionId,
      );
    }
    if (resolved.status === "expired") {
      throw new GatekitDeniedError(
        "The approval window expired before a decision was made.",
        "approval_expired",
        evaluation.actionId,
      );
    }
    throw new GatekitDeniedError(
      "Timed out waiting for approval.",
      "timeout",
      evaluation.actionId,
    );
  }
}
