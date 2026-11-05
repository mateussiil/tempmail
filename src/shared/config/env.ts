/**
 * Leitura de variáveis de ambiente, sempre em tempo de execução e só quando
 * alguém precisa delas. Assim o build e os testes rodam sem nenhum segredo.
 */
export class MissingEnvError extends Error {
  constructor(readonly variable: string) {
    super(`Variável de ambiente ausente: ${variable}`);
    this.name = "MissingEnvError";
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}

export function databaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

/** As migrations rodam na subida do servidor, a menos que RUN_MIGRATIONS=false. */
export function shouldRunMigrations(): boolean {
  return process.env.RUN_MIGRATIONS !== "false";
}
