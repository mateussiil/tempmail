import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FakeApiKeyGateway } from "../testing/FakeApiKeyGateway";
import { claudeMcpCommand } from "./ApiKeysPanel";
import { ApiKeysScreen } from "./ApiKeysScreen";

const MCP = "https://tempmail.exemplo.test/api/mcp";

async function setup(seed: string[] = []) {
  const gateway = new FakeApiKeyGateway();
  for (const name of seed) await gateway.create(name);
  const onSessionEnded = vi.fn();
  render(
    <ApiKeysScreen
      gateway={gateway}
      mcpUrl={MCP}
      onSessionEnded={onSessionEnded}
      clock={() => new Date("2026-11-05T12:00:00Z")}
    />,
  );
  return { gateway, onSessionEnded };
}

describe("ApiKeysScreen", () => {
  it("sem chaves, convida a criar", async () => {
    await setup();

    expect(await screen.findByText(/Nenhuma chave ainda/)).toBeInTheDocument();
  });

  it("cria uma chave e mostra o segredo uma vez, com o comando do Claude Code", async () => {
    await setup();
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Nova chave" }));
    await u.type(screen.getByLabelText(/Nome da chave/), "CI do projeto X");
    await u.click(screen.getByRole("button", { name: "Criar chave" }));

    expect(await screen.findByText(/Chave "CI do projeto X" criada/)).toBeInTheDocument();
    expect(screen.getByText("tm_teste10-segredo-de-teste")).toBeInTheDocument();
    expect(screen.getByText(claudeMcpCommand(MCP, "tm_teste10-segredo-de-teste"))).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Suas chaves" });
    expect(within(list).getByText("CI do projeto X")).toBeInTheDocument();
    expect(within(list).getByText("nunca")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Já copiei" }));
    expect(screen.queryByText("tm_teste10-segredo-de-teste")).not.toBeInTheDocument();
  });

  it("revoga com confirmação", async () => {
    const { gateway } = await setup(["Cursor"]);
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Revogar a chave Cursor" }));
    await u.click(screen.getByRole("button", { name: "Revogar" }));

    expect(await screen.findByText("revogada")).toBeInTheDocument();
    expect(gateway.keys[0].revokedAt).not.toBeNull();
  });

  it("nome vazio não deixa criar", async () => {
    await setup();
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Nova chave" }));

    expect(screen.getByRole("button", { name: "Criar chave" })).toBeDisabled();
  });

  it("sessão acabada leva pro login", async () => {
    const gateway = new FakeApiKeyGateway();
    gateway.list = async () => ({ ok: false, error: { status: 401, code: "unauthenticated", message: "", details: {} } });
    const onSessionEnded = vi.fn();
    render(<ApiKeysScreen gateway={gateway} mcpUrl={MCP} onSessionEnded={onSessionEnded} />);

    await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledWith("anonymous"));
  });
});
