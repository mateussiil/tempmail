type AccessDeniedPageProps = {
  /** Email que recebe os pedidos de acesso; sem ele, a página só orienta. */
  requestEmail?: string;
};

const SUBJECT = "Pedido de acesso ao tempmail";
const BODY = [
  "Olá! Gostaria de acesso ao tempmail.",
  "",
  "Meu usuário do GitHub: @",
  "Para que vou usar: ",
].join("\n");

/** Onde cai quem entrou com um GitHub que não está na lista do time. */
export function AccessDeniedPage({ requestEmail }: AccessDeniedPageProps) {
  const href = requestEmail
    ? `mailto:${requestEmail}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`
    : undefined;

  return (
    <main className="card-page">
      <section className="card" aria-labelledby="access-denied-title">
        <h1 id="access-denied-title">Você ainda não tem acesso</h1>
        <p>
          Esta conta do GitHub não está na lista do time do tempmail. O acesso é liberado por
          convite.
        </p>
        {href ? (
          <>
            <p>Quer entrar? Peça o acesso por email, dizendo seu usuário do GitHub.</p>
            <a className="button" href={href}>
              Pedir acesso por email
            </a>
          </>
        ) : (
          <p>Quer entrar? Fale com quem administra o tempmail.</p>
        )}
        <p className="muted small">
          <a href="/entrar">Tentar com outra conta</a>
        </p>
      </section>
    </main>
  );
}
