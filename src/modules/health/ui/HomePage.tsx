type HomePageProps = {
  databaseUp: boolean;
};

/** Só apresentação: recebe o que precisa, nunca repositórios nem configuração. */
export function HomePage({ databaseUp }: HomePageProps) {
  return (
    <main className="home">
      <h1>tempmail</h1>
      <p>Emails temporários para o time.</p>
      <p role="status" className={databaseUp ? "status status-up" : "status status-down"}>
        {databaseUp ? "Banco de dados: no ar" : "Banco de dados: fora do ar"}
      </p>
    </main>
  );
}
