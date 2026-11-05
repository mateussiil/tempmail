import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { Allowlist } from "../domain/Allowlist";
import { assertAllowedToJoin } from "./auth";

const list = Allowlist.fromString("ana,bruno");

describe("assertAllowedToJoin", () => {
  it("deixa passar quem está na lista", () => {
    expect(() => assertAllowedToJoin("ana", list)).not.toThrow();
    expect(() => assertAllowedToJoin("BRUNO", list)).not.toThrow();
  });

  it("recusa com 403 quem não está na lista", () => {
    expect.assertions(2);
    try {
      assertAllowedToJoin("carla", list);
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe("FORBIDDEN");
    }
  });

  it("recusa quando o username não veio do GitHub", () => {
    expect(() => assertAllowedToJoin(undefined, list)).toThrow(APIError);
    expect(() => assertAllowedToJoin(42, list)).toThrow(APIError);
  });

  it("falha fechada com a lista vazia", () => {
    expect(() => assertAllowedToJoin("ana", Allowlist.fromString(""))).toThrow(APIError);
  });
});
