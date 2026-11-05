import { describe, expect, it } from "vitest";
import { parseInboxAddress } from "../domain/InboxAddress";
import { generateRandomAddress } from "./randomAddress";

describe("generateRandomAddress", () => {
  it("gera 8 caracteres que passam na validação de endereço", () => {
    for (let i = 0; i < 200; i++) {
      const address = generateRandomAddress();

      expect(address).toHaveLength(8);
      expect(parseInboxAddress(address)).toEqual({ ok: true, value: address });
    }
  });

  it("não usa caracteres que se confundem", () => {
    const all = Array.from({ length: 300 }, () => generateRandomAddress()).join("");

    expect(all).not.toMatch(/[ilo01]/);
  });

  it("não repete em sequência", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateRandomAddress()));

    expect(seen.size).toBe(500);
  });
});
