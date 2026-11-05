import { describe, expect, it } from "vitest";
import { ADDRESS_MAX_LENGTH, normalizeAddress, parseInboxAddress } from "./InboxAddress";

describe("parseInboxAddress", () => {
  it("aceita letras, números, ponto e hífen", () => {
    for (const good of ["stripe-teste", "qa.login", "k7f3qx9m", "a1b", "teste-checkout.2"]) {
      expect(parseInboxAddress(good)).toEqual({ ok: true, value: good });
    }
  });

  it("normaliza maiúsculas e espaços nas pontas", () => {
    expect(parseInboxAddress("  Stripe-Teste ")).toEqual({ ok: true, value: "stripe-teste" });
    expect(normalizeAddress(" ABC ")).toBe("abc");
  });

  it("recusa tamanho fora de 3 a 40 caracteres", () => {
    expect(parseInboxAddress("ab")).toEqual({ ok: false, problem: "length" });
    expect(parseInboxAddress("")).toEqual({ ok: false, problem: "length" });
    expect(parseInboxAddress("a".repeat(ADDRESS_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(parseInboxAddress("a".repeat(ADDRESS_MAX_LENGTH + 1))).toEqual({
      ok: false,
      problem: "length",
    });
  });

  it("recusa caracteres fora do permitido", () => {
    for (const bad of ["com espaco", "a+b+c", "ação-boa", "a_b_c", "a@b.com", "a/b/c", "abc!"]) {
      expect(parseInboxAddress(bad)).toEqual({ ok: false, problem: "characters" });
    }
  });

  it("recusa separador no começo, no fim ou repetido", () => {
    for (const bad of [".abc", "abc.", "-abc", "abc-", "a..b", "a--b", "a.-b"]) {
      expect(parseInboxAddress(bad)).toEqual({ ok: false, problem: "characters" });
    }
  });
});
