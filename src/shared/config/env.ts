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

const AUTH_ENV_VARS = [
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
] as const;

/** Nomes (nunca valores) das variáveis do login que estão ausentes ou vazias. */
export function missingAuthEnv(env: Record<string, string | undefined> = process.env): string[] {
  return AUTH_ENV_VARS.filter((name) => !env[name]);
}

/** As migrations rodam na subida do servidor, a menos que RUN_MIGRATIONS=false. */
export function shouldRunMigrations(): boolean {
  return process.env.RUN_MIGRATIONS !== "false";
}
