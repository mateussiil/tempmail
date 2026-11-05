import { describe, expect, it } from "vitest";
import { InboxPolicy } from "./InboxPolicy";

describe("InboxPolicy", () => {
  it("calcula o fim do prazo a partir de agora", () => {
    const policy = new InboxPolicy(20, 24);
    const now = new Date("2026-11-05T12:00:00Z");

    expect(policy.expiryFrom(now)).toEqual(new Date("2026-11-06T12:00:00Z"));
  });

  it("recusa limite e prazo que não sejam inteiros positivos", () => {
    expect(() => new InboxPolicy(0, 24)).toThrow();
    expect(() => new InboxPolicy(20, 0)).toThrow();
    expect(() => new InboxPolicy(2.5, 24)).toThrow();
  });
});
