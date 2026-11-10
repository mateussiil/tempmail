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
 * A proposta é email temporário de fácil acesso para IA; cadastro, login e
 * testes são usos disso, não o centro.
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
              <span className="landing-title-line">Email temporário</span>
              <br />
              <span className="landing-title-accent">para a sua IA.</span>
            </h1>
            <p className="landing-lede">
              Seu agente cria uma caixa em <span className="mono">@{mailDomain}</span>, espera o email chegar e
              lê o que precisa, sozinho, pelo MCP ou pela API. Sem emprestar o seu email e sem copiar código de
              um lado para o outro.
            </p>
            <div className="landing-cta">
              {signInButton}
              <span className="muted small">Acesso para quem está na lista do time.</span>
            </div>
          </div>

          <figure className="landing-demo" aria-label="Exemplo: um código de verificação chegando na caixa do agente">
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
            Como o agente usa
          </h2>
          <ol className="landing-steps">
            <li>
              <strong>Conecte uma vez</strong>
              <span>
                O claude.ai entra por OAuth. Claude Code, Codex, Cursor e outros clientes MCP usam uma Chave de API.
              </span>
            </li>
            <li>
              <strong>Ele cria a caixa</strong>
              <span>
                <span className="mono">create_inbox</span> devolve um endereço na hora, com nome escolhido ou
                aleatório.
              </span>
            </li>
            <li>
              <strong>Ele espera e lê</strong>
              <span>
                <span className="mono">wait_for_email</span> segura até o email chegar, e{" "}
                <span className="mono">extract_code</span> separa o código do resto.
              </span>
            </li>
          </ol>
        </section>

        <section className="landing-section landing-agents" aria-labelledby="para-agentes">
          <div>
            <h2 id="para-agentes" className="landing-h2">
              Conecte em um minuto
            </h2>
            <p>
              Um comando e o seu agente ganha as ferramentas de email. Ele cria a caixa, usa o endereço e espera a
              resposta sem você no meio.
            </p>
            <p className="muted small">
              Cada pessoa cria as suas Chaves de API depois de entrar, com o passo a passo de cada cliente. Tudo o que
              o MCP faz também está na API REST, para scripts e testes.
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

        <section className="landing-section" aria-labelledby="usos">
          <h2 id="usos" className="landing-h2">
            Para que a IA usa
          </h2>
          <dl className="landing-rules">
            <div>
              <dt>Cadastros e logins</dt>
              <dd>O agente se cadastra num serviço e confirma o código ou o link de acesso sem pedir ajuda.</dd>
            </div>
            <div>
              <dt>Testes ponta a ponta</dt>
              <dd>Cada execução ganha um endereço novo. O teste espera o email e segue o fluxo.</dd>
            </div>
            <div>
              <dt>Qualquer fluxo com email</dt>
              <dd>Convites, confirmações, recibos e anexos: o agente recebe e lê o conteúdo.</dd>
            </div>
          </dl>
          <p className="muted small">E quando for você, a página mostra as mesmas caixas, com o código em destaque.</p>
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
