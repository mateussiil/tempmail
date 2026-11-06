import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsentErrorPage, ConsentPage, describeScopes } from "./ConsentPage";

const actions = <button type="button">Permitir</button>;

describe("ConsentPage", () => {
  it("diz quem pede, o que pode fazer e pra onde a autorização volta", () => {
    render(
      <ConsentPage
        clientName="Claude"
        redirectHost="claude.ai"
        loopbackOnly={false}
        scopes={describeScopes("tempmail offline_access")}
        githubUsername="ana"
        actions={actions}
      />,
    );

    expect(screen.getByRole("heading", { name: "Claude quer acessar o seu tempmail" })).toBeInTheDocument();
    expect(screen.getByText(/criar, listar, ler, esperar emails e apagar/)).toBeInTheDocument();
    expect(screen.getByText("claude.ai")).toBeInTheDocument();
    expect(screen.getByText("@ana")).toBeInTheDocument();
    expect(screen.queryByText(/endereço local/)).not.toBeInTheDocument();
  });

  it("avisa quando a autorização volta para um endereço local", () => {
    render(
      <ConsentPage clientName="Claude Code" redirectHost="127.0.0.1" loopbackOnly scopes={[]} githubUsername="ana" actions={actions} />,
    );

    expect(screen.getByText(/endereço local do seu computador/)).toBeInTheDocument();
  });

  it("escopos desconhecidos aparecem pelo nome, sem repetir", () => {
    expect(describeScopes("openid tempmail  openid outro")).toEqual([
      "Saber quem você é",
      "Usar as suas Caixas e Mensagens: criar, listar, ler, esperar emails e apagar",
      "outro",
    ]);
  });

  it("pedido inválido mostra o erro", () => {
    render(<ConsentErrorPage message="O pedido de autorização é inválido ou venceu." />);

    expect(screen.getByText("O pedido de autorização é inválido ou venceu.")).toBeInTheDocument();
  });
});
