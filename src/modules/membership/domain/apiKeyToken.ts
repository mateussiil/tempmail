import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "tm_";
const PREFIX_LENGTH = TOKEN_PREFIX.length + 8;
const MAX_TOKEN_LENGTH = 128;

/** Segredo novo: `tm_` + 24 bytes aleatórios em base64url (192 bits de entropia). */
export function generateApiKeyToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

/** O banco só guarda isto: SHA-256 basta porque o segredo já é aleatório e longo. */
export function hashApiKeyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function apiKeyPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}

/** Descarta de cara o que não tem o formato de uma chave, sem ir ao banco. */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length > PREFIX_LENGTH && token.length <= MAX_TOKEN_LENGTH;
}
