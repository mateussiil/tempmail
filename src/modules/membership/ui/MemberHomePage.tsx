import type { ReactNode } from "react";

type MemberHomePageProps = {
  name: string;
  githubUsername: string;
  /** O botão de sair (componente de cliente) entra aqui. */
  actions: ReactNode;
};

export function MemberHomePage({ name, githubUsername, actions }: MemberHomePageProps) {
  return (
    <main className="home">
      <header className="topbar">
        <strong>tempmail</strong>
        <span className="muted">@{githubUsername}</span>
        {actions}
      </header>
      <h1>Olá, {name}</h1>
      <p>Suas caixas vão aparecer aqui.</p>
    </main>
  );
}
