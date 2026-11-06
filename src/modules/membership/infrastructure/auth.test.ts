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

describe("OAuth do conector do claude.ai", () => {
  it("só aceita CIMD de hosts permitidos (claude.ai por padrão), e só em https", async () => {
    const { isAllowedClientIdUrl, oauthClientHosts } = await import("./auth");
    const hosts = oauthClientHosts({});

    expect(hosts).toEqual(["claude.ai"]);
    expect(isAllowedClientIdUrl("https://claude.ai/oauth/claude-code-client-metadata", hosts)).toBe(true);
    expect(isAllowedClientIdUrl("https://Claude.AI/x", hosts)).toBe(true);
    expect(isAllowedClientIdUrl("http://claude.ai/x", hosts)).toBe(false);
    expect(isAllowedClientIdUrl("https://claude.ai.evil.example/x", hosts)).toBe(false);
    expect(isAllowedClientIdUrl("https://evil.example/claude.ai", hosts)).toBe(false);
    expect(isAllowedClientIdUrl("não é url", hosts)).toBe(false);
    expect(oauthClientHosts({ OAUTH_CLIENT_HOSTS: "claude.ai, Exemplo.test" })).toEqual(["claude.ai", "exemplo.test"]);
  });

  it("o recurso é a URL do MCP e as chaves são buscadas por dentro", async () => {
    const { jwksUrl, mcpResourceUrl } = await import("./auth");

    expect(mcpResourceUrl({ BETTER_AUTH_URL: "https://tempmail.exemplo.test/" })).toBe("https://tempmail.exemplo.test/api/mcp");
    expect(jwksUrl({})).toBe("http://127.0.0.1:3000/api/auth/jwks");
    expect(jwksUrl({ PORT: "8080" })).toBe("http://127.0.0.1:8080/api/auth/jwks");
    expect(jwksUrl({ OAUTH_JWKS_URL: "https://x.test/jwks" })).toBe("https://x.test/jwks");
  });
});
