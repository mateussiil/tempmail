import { describe, expect, it } from "vitest";
import { apiKeyPrefix, generateApiKeyToken, hashApiKeyToken, looksLikeApiKey } from "./apiKeyToken";

describe("apiKeyToken", () => {
  it("gera segredos diferentes, no formato tm_…", () => {
    const a = generateApiKeyToken();
    const b = generateApiKeyToken();

    expect(a).toMatch(/^tm_[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(looksLikeApiKey(a)).toBe(true);
  });

  it("o prefixo mostra só o começo, sem revelar o segredo", () => {
    const token = generateApiKeyToken();

    expect(apiKeyPrefix(token)).toBe(token.slice(0, 11));
    expect(apiKeyPrefix(token)).toHaveLength(11);
  });

  it("o hash é estável e não contém o segredo", () => {
    const token = generateApiKeyToken();

    expect(hashApiKeyToken(token)).toBe(hashApiKeyToken(token));
    expect(hashApiKeyToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKeyToken(token)).not.toContain(token.slice(3));
  });

  it("recusa o que não tem cara de chave", () => {
    for (const bad of ["", "tm_", "tm_curta", "abc123456789012345", `tm_${"a".repeat(200)}`]) {
      expect(looksLikeApiKey(bad)).toBe(false);
    }
  });
});
