import { describe, expect, it } from "vitest";
import { appUrlFromMcp, clientSetups } from "./clientSetups";

const MCP = "https://tempmail.exemplo.test/api/mcp";
const TOKEN = "tm_segredo-de-teste";

const setup = (id: string) => {
  const found = clientSetups(MCP, TOKEN).find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found.steps.map((step) => step.code).join("\n");
};

describe("clientSetups", () => {
  it("oferece Claude Code, Codex, Cursor, Grok, outro cliente MCP e a API REST, nessa ordem", () => {
    expect(clientSetups(MCP, TOKEN).map((s) => s.label)).toEqual([
      "Claude Code",
      "Codex",
      "Cursor",
      "Grok (API)",
      "Outro cliente MCP",
      "Bot (API REST)",
    ]);
  });

  it("todos levam a chave e o endereço certo", () => {
    for (const s of clientSetups(MCP, TOKEN)) {
      const code = s.steps.map((step) => step.code).join("\n");
      expect(code, s.id).toContain(TOKEN);
      expect(code, s.id).toContain("https://tempmail.exemplo.test/api/");
    }
  });

  it("Claude Code: o comando com o cabeçalho", () => {
    expect(setup("claude-code")).toBe(
      `claude mcp add --transport http tempmail ${MCP} --header "Authorization: Bearer ${TOKEN}"`,
    );
  });

  it("Codex: a chave numa variável e o servidor lendo dela", () => {
    expect(setup("codex")).toBe(
      `export TEMPMAIL_KEY=${TOKEN}\ncodex mcp add tempmail --url ${MCP} --bearer-token-env-var TEMPMAIL_KEY`,
    );
  });

  it("Cursor: um mcp.json válido", () => {
    expect(JSON.parse(setup("cursor"))).toEqual({
      mcpServers: { tempmail: { url: MCP, headers: { Authorization: `Bearer ${TOKEN}` } } },
    });
  });

  it("Grok: a ferramenta MCP com a chave em X-API-Key", () => {
    const code = setup("grok");
    expect(code).toContain(`"server_url": "${MCP}"`);
    expect(code).toContain(`"headers": {"X-API-Key": "${TOKEN}"}`);
    expect(code).toContain('base_url="https://api.x.ai/v1"');
  });

  it("API REST: curl na URL do app, não do MCP", () => {
    expect(setup("rest")).toContain(`curl -X POST https://tempmail.exemplo.test/api/inboxes -H "Authorization: Bearer ${TOKEN}"`);
    expect(appUrlFromMcp("https://x.test/api/mcp/")).toBe("https://x.test");
  });
});
