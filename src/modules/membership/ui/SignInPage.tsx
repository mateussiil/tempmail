import type { ReactNode } from "react";

type SignInPageProps = {
  /** Mensagem de erro do último login, se houve. */
  errorMessage?: string;
  /** O botão de entrar (componente de cliente) entra aqui. */
  signInButton: ReactNode;
};

export function SignInPage({ errorMessage, signInButton }: SignInPageProps) {
  return (
    <main className="card-page">
      <section className="card" aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">Entrar no tempmail</h1>
        <p>Use sua conta do GitHub. O acesso é só para quem está na lista do time.</p>
        {errorMessage ? (
          <p role="alert" className="alert alert-bad">
            {errorMessage}
          </p>
        ) : null}
        {signInButton}
      </section>
    </main>
  );
}
