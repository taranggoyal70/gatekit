import { describe, expect, it } from "vitest";

import { AppError } from "./errors";
import { assertOrgRole, hasOrgRole } from "./roles";

describe("hasOrgRole", () => {
  it("orders member < admin < owner", () => {
    expect(hasOrgRole("member", "member")).toBe(true);
    expect(hasOrgRole("member", "admin")).toBe(false);
    expect(hasOrgRole("admin", "admin")).toBe(true);
    expect(hasOrgRole("admin", "owner")).toBe(false);
    expect(hasOrgRole("owner", "admin")).toBe(true);
  });
});

describe("assertOrgRole", () => {
  it("lets admins and owners change policies", () => {
    expect(() => assertOrgRole("admin", "admin")).not.toThrow();
    expect(() => assertOrgRole("owner", "admin")).not.toThrow();
  });

  it("refuses members with a 403", () => {
    let caught: unknown;
    try {
      assertOrgRole("member", "admin");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).status).toBe(403);
    expect((caught as AppError).code).toBe("insufficient_role");
  });
});
