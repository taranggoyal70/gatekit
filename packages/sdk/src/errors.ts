export class GatekitApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GatekitApiError";
    this.status = status;
    this.code = code;
  }
}

export type DenialReason =
  | "denied"
  | "approval_denied"
  | "approval_expired"
  | "timeout";

/**
 * Thrown by guard() whenever the wrapped function must NOT run: the policy
 * denied it outright, a human denied it, the approval window expired, or
 * the caller's wait timed out. Catching this (or letting it propagate) is
 * how callers distinguish "did not execute" from "threw while executing".
 */
export class GatekitDeniedError extends Error {
  readonly reason: DenialReason;
  readonly actionId: string;

  constructor(message: string, reason: DenialReason, actionId: string) {
    super(message);
    this.name = "GatekitDeniedError";
    this.reason = reason;
    this.actionId = actionId;
  }
}
