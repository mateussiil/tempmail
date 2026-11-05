import type { ReactNode } from "react";

type AccessEndedPageProps = {
  githubUsername: string | null;
  /** O botão de sair (componente de cliente) entra aqui. */
  actions: ReactNode;
};

export function AccessEndedPage({ githubUsername, actions }: AccessEndedPageProps) {
  return (
    <main className="card-page">
      <section className="card" aria-labelledby="access-ended-title">
        <h1 id="access-ended-title">Seu acesso foi encerrado</h1>
        <p>
          {githubUsername ? `O usuário @${githubUsername} ` : "Este usuário "}
          não está mais na lista do tempmail. Suas caixas expiraram e suas chaves de API pararam de
          funcionar. Fale com quem administra o tempmail.
        </p>
        {actions}
      </section>
    </main>
  );
}
