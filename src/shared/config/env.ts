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

/**
 * Número inteiro positivo vindo do ambiente. Ausente ou vazio usa o padrão;
 * valor inválido lança, pra um limite errado nunca passar despercebido.
 */
export function positiveIntEnv(
  name: string,
  fallback: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} precisa ser um número inteiro maior que zero (recebido: "${raw}")`);
  }
  return value;
}

/** Domínio dos endereços das Caixas (o do MX). */
export function mailDomain(env: Record<string, string | undefined> = process.env): string {
  return (env.MAIL_DOMAIN?.trim() || "tmp.mateussiil.com.br").toLowerCase();
}

const RECEIVING_ENV_VARS = [
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

/** Nomes (nunca valores) das variáveis do recebimento que estão ausentes ou vazias. */
export function missingReceivingEnv(env: Record<string, string | undefined> = process.env): string[] {
  return RECEIVING_ENV_VARS.filter((name) => !env[name]);
}

/** Raiz da API do Resend; só se sobrescreve em testes. */
export function resendApiUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.RESEND_API_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "");
}

/** Tamanho máximo de uma Mensagem em bytes (`MAX_MESSAGE_MB`, 10 por padrão). */
export function maxMessageBytes(env: Record<string, string | undefined> = process.env): number {
  return positiveIntEnv("MAX_MESSAGE_MB", 10, env) * 1024 * 1024;
}

/** Com `WEBHOOK_DEBUG_LOG=true`, o webhook registra o conteúdo recebido (só para emails de teste). */
export function webhookDebugEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WEBHOOK_DEBUG_LOG?.trim().toLowerCase() === "true";
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
