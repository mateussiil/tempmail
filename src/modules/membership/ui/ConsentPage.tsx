import type { ReactNode } from "react";

/** O que cada escopo deixa o cliente fazer, em português. */
const SCOPE_TEXT: Record<string, string> = {
  tempmail: "Usar as suas Caixas e Mensagens: criar, listar, ler, esperar emails e apagar",
  openid: "Saber quem você é",
  profile: "Ver o seu nome e a sua foto",
  email: "Ver o seu email",
  offline_access: "Continuar conectado sem pedir de novo",
};

export function describeScopes(scope: string): string[] {
  const names = scope.split(/\s+/).filter(Boolean);
  const described = names.map((name) => SCOPE_TEXT[name] ?? name);
  return [...new Set(described)];
}

type ConsentPageProps = {
  clientName: string;
  /** O host pra onde o código vai (a spec do MCP pede que apareça). */
  redirectHost: string;
  /** Só endereços locais (127.0.0.1, localhost): qualquer programa da máquina pode recebê-los. */
  loopbackOnly: boolean;
  scopes: string[];
  githubUsername: string;
  /** Os botões Permitir e Recusar (componente de cliente). */
  actions: ReactNode;
};

/** "O Claude quer acessar suas Caixas": quem pede, pra onde volta, o que pode fazer. */
export function ConsentPage({ clientName, redirectHost, loopbackOnly, scopes, githubUsername, actions }: ConsentPageProps) {
  return (
    <main className="card-page">
      <section className="card consent" aria-labelledby="consent-title">
        <h1 id="consent-title">{clientName} quer acessar o seu tempmail</h1>
        <p>
          Você está conectado como <strong>@{githubUsername}</strong>. Se permitir, {clientName} vai poder:
        </p>
        <ul className="consent-scopes">
          {scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
        <p className="small">
          A autorização volta para <strong className="mono">{redirectHost}</strong>. Você pode desconectar a qualquer
          momento no próprio {clientName}.
        </p>
        {loopbackOnly ? (
          <p className="alert alert-bad small">
            Este cliente recebe a autorização num endereço local do seu computador. Só permita se foi você que acabou
            de pedir a conexão.
          </p>
        ) : null}
        {actions}
      </section>
    </main>
  );
}

/** O pedido de autorização chegou adulterado, vencido ou de um cliente desconhecido. */
export function ConsentErrorPage({ message }: { message: string }) {
  return (
    <main className="card-page">
      <section className="card" aria-labelledby="consent-error-title">
        <h1 id="consent-error-title">Não deu pra continuar a conexão</h1>
        <p>{message}</p>
        <p className="small">Volte ao aplicativo que pediu a conexão e tente de novo.</p>
      </section>
    </main>
  );
}
