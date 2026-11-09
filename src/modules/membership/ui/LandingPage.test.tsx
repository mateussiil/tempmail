import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

function renderLanding() {
  return render(
    <LandingPage
      mailDomain="tmp.exemplo.test"
      ttlHours={24}
      maxActiveInboxes={20}
      mcpUrl="https://tempmail.exemplo.test/api/mcp"
      signInButton={<button type="button">Entrar com GitHub</button>}
    />,
  );
}

describe("LandingPage", () => {
  it("apresenta o produto e oferece entrar no topo, no início e no fim", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Um email na hora.O código, em destaque.");
    expect(screen.getAllByRole("button", { name: "Entrar com GitHub" })).toHaveLength(3);
    expect(screen.getByText(/está na lista, peça a quem administra/)).toBeInTheDocument();
  });

  it("usa o domínio, o prazo, o limite e o endereço do MCP configurados", () => {
    renderLanding();

    expect(screen.getByText("@tmp.exemplo.test")).toBeInTheDocument();
    expect(screen.getByText("24 h de prazo")).toBeInTheDocument();
    expect(screen.getByText("Até 20 caixas ativas")).toBeInTheDocument();
    expect(screen.getByLabelText("Exemplo de uso com o Claude Code")).toHaveTextContent("https://tempmail.exemplo.test/api/mcp");
  });

  it("deixa ouvir o Hermes passar, sem tocar nada sozinho", () => {
    renderLanding();

    expect(screen.getByRole("button", { name: "Ouvir o Hermes passar assobiando" })).toBeInTheDocument();
  });

  it("mostra a turma inteira de mensageiros", () => {
    renderLanding();

    const section = screen.getByRole("heading", { name: "Cada caixa tem um mensageiro" }).closest("section")!;
    expect(within(section).getAllByRole("listitem")).toHaveLength(15);
    expect(within(section).getByText("Capivara")).toBeInTheDocument();
  });
});
