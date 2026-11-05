import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessEndedPage } from "./AccessEndedPage";
import { NotConfiguredPage } from "./NotConfiguredPage";
import { SignInPage } from "./SignInPage";

const button = <button type="button">botão de teste</button>;

describe("SignInPage", () => {
  it("mostra o botão de entrar e nenhum erro por padrão", () => {
    render(<SignInPage signInButton={button} />);

    expect(screen.getByRole("heading", { name: "Entrar no tempmail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "botão de teste" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra o erro do último login", () => {
    render(<SignInPage errorMessage="Não foi possível entrar." signInButton={button} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível entrar.");
  });
});

describe("AccessEndedPage", () => {
  it("explica o encerramento citando o username", () => {
    render(<AccessEndedPage githubUsername="ana" actions={button} />);

    expect(screen.getByRole("heading", { name: "Seu acesso foi encerrado" })).toBeInTheDocument();
    expect(screen.getByText(/@ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "botão de teste" })).toBeInTheDocument();
  });

  it("funciona sem username", () => {
    render(<AccessEndedPage githubUsername={null} actions={button} />);

    expect(screen.getByText(/Este usuário/)).toBeInTheDocument();
  });
});

describe("NotConfiguredPage", () => {
  it("lista só os nomes das variáveis que faltam", () => {
    render(<NotConfiguredPage missing={["GITHUB_CLIENT_ID", "BETTER_AUTH_SECRET"]} />);

    expect(screen.getByText("GITHUB_CLIENT_ID")).toBeInTheDocument();
    expect(screen.getByText("BETTER_AUTH_SECRET")).toBeInTheDocument();
  });
});
