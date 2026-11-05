type NotConfiguredPageProps = {
  /** Nomes das variáveis de ambiente que faltam (nunca valores). */
  missing: string[];
};

export function NotConfiguredPage({ missing }: NotConfiguredPageProps) {
  return (
    <main className="card-page">
      <section className="card" aria-labelledby="not-configured-title">
        <h1 id="not-configured-title">Login ainda não configurado</h1>
        <p>Faltam estas variáveis de ambiente no servidor:</p>
        <ul>
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
