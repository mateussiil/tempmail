import type { ReactNode } from "react";
import { MASCOTS } from "@/modules/inbox/domain/Mascot";
import { MascotAvatar } from "@/modules/inbox/ui/MascotAvatar";
import { BrandMark } from "./AppShell";
import { HermesWhistle } from "./HermesWhistle";

type LandingPageProps = {
  mailDomain: string;
  ttlHours: number;
  maxActiveInboxes: number;
  /** Endereço público do MCP, para o exemplo de conexão. */
  mcpUrl: string;
  /** O botão de entrar (componente de cliente); aparece no topo, no início e no fim. */
  signInButton: ReactNode;
};

/**
 * A página de quem ainda não entrou: o que o tempmail faz e a porta de entrada.
 * O acesso continua só para quem está na lista do time.
 */
export function LandingPage({ mailDomain, ttlHours, maxActiveInboxes, mcpUrl, signInButton }: LandingPageProps) {
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="brand">
          <BrandMark />
          <span className="brand-name">tempmail</span>
        </span>
        {signInButton}
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-text">
            <h1 id="landing-title" className="landing-title">
              <span className="landing-title-line">Um email na hora.</span>
              <br />
              <span className="landing-title-accent">O código, em destaque.</span>
            </h1>
            <p className="landing-lede">
              Caixas temporárias em <span className="mono">@{mailDomain}</span> para testar cadastro, login e
              redefinição de senha, pela página, pela API ou pelo seu agente via MCP.
            </p>
            <div className="landing-cta">
              {signInButton}
              <span className="muted small">Acesso para quem está na lista do time.</span>
            </div>
          </div>

          <figure className="landing-demo" aria-label="Exemplo: um código de verificação chegando numa caixa">
            <HermesWhistle />
            <div className="demo-card">
              <div className="demo-address">
                <MascotAvatar mascot="hermes" size="sm" decorative />
                <span className="mono demo-address-text">k7f3qx9m@{mailDomain}</span>
              </div>
              <div className="demo-message">
                <span className="demo-from">
                  <strong>Acme Cloud</strong>
                  <span className="muted">agora</span>
                </span>
                <span>Seu código de verificação</span>
              </div>
              <div className="demo-code">
                <span className="demo-code-label">Código de verificação</span>
                <span className="demo-code-value mono">482913</span>
                <span className="demo-code-copy" aria-hidden="true">
                  Copiar código
                </span>
              </div>
            </div>
          </figure>
        </section>

        <section className="landing-section" aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="landing-h2">
            Como funciona
          </h2>
          <ol className="landing-steps">
            <li>
              <strong>Crie uma caixa</strong>
              <span>Com nome escolhido, como <span className="mono">teste-pix</span>, ou aleatório.</span>
            </li>
            <li>
              <strong>Use o endereço</strong>
              <span>No cadastro, no login ou no fluxo que você está testando.</span>
            </li>
            <li>
              <strong>Copie o código</strong>
              <span>O email aparece em segundos, com o código de verificação separado do resto.</span>
            </li>
          </ol>
        </section>

        <section className="landing-section landing-agents" aria-labelledby="para-agentes">
          <div>
            <h2 id="para-agentes" className="landing-h2">
              Para scripts e agentes
            </h2>
            <p>
              Tudo o que a página faz também está na API REST e no servidor MCP. Um agente cria a caixa, faz o
              cadastro e espera o código sozinho, sem você copiar nada.
            </p>
            <p className="muted small">
              Cada pessoa cria as suas Chaves de API depois de entrar. Claude Code, Codex, Cursor e outros clientes
              MCP têm o passo a passo pronto. O claude.ai conecta por OAuth.
            </p>
          </div>
          <pre className="landing-code" aria-label="Exemplo de uso com o Claude Code">
            <code>
              <span className="code-comment"># conectar o Claude Code</span>
              {"\n"}claude mcp add --transport http tempmail \{"\n"}
              {"  "}
              {mcpUrl} \{"\n"}
              {"  "}--header &quot;Authorization: Bearer tm_…&quot;
              {"\n\n"}
              <span className="code-comment"># o que o agente faz</span>
              {"\n"}create_inbox    → k7f3qx9m@{mailDomain}
              {"\n"}wait_for_email  → &quot;Seu código de verificação&quot;
              {"\n"}extract_code    → <span className="code-accent">482913</span>
            </code>
          </pre>
        </section>

        <section className="landing-section" aria-labelledby="mensageiros">
          <h2 id="mensageiros" className="landing-h2">
            Cada caixa tem um mensageiro
          </h2>
          <p className="muted">Você escolhe ao criar, ou um é sorteado. Ajuda a achar a caixa certa na lista.</p>
          <ul className="landing-mascots">
            {MASCOTS.map((mascot) => (
              <li key={mascot.id}>
                <MascotAvatar mascot={mascot.id} size="sm" decorative />
                <span>{mascot.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="regras">
          <h2 id="regras" className="landing-h2">
            As regras
          </h2>
          <dl className="landing-rules">
            <div>
              <dt>{ttlHours} h de prazo</dt>
              <dd>Depois a caixa expira e as mensagens são apagadas. Marque Manter para tirar o prazo.</dd>
            </div>
            <div>
              <dt>O endereço é seu</dt>
              <dd>Ninguém mais do time pode usá-lo, nem depois de expirar. Criar de novo reativa a caixa, vazia.</dd>
            </div>
            <div>
              <dt>Até {maxActiveInboxes} caixas ativas</dt>
              <dd>Por pessoa, contando as mantidas. Apagar uma libera a vaga.</dd>
            </div>
          </dl>
        </section>

        <section className="landing-end" aria-labelledby="entrar">
          <h2 id="entrar" className="landing-h2">
            É do time? Entre com o GitHub.
          </h2>
          {signInButton}
          <p className="muted small">
            Se o seu usuário do GitHub não está na lista, peça a quem administra o tempmail para incluí-lo.
          </p>
        </section>
      </main>
    </div>
  );
}
