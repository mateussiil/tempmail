export const ADDRESS_MIN_LENGTH = 3;
export const ADDRESS_MAX_LENGTH = 40;

export type AddressProblem = "length" | "characters";

export type ParsedAddress = { ok: true; value: string } | { ok: false; problem: AddressProblem };

// Letras, números, ponto e hífen; sem começar, terminar ou repetir separadores.
const PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** O endereço é sempre guardado em minúsculas e sem espaços nas pontas. */
export function normalizeAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Valida a parte local do endereço (o que vem antes do `@`). */
export function parseInboxAddress(raw: string): ParsedAddress {
  const value = normalizeAddress(raw);

  if (value.length < ADDRESS_MIN_LENGTH || value.length > ADDRESS_MAX_LENGTH) {
    return { ok: false, problem: "length" };
  }
  if (!PATTERN.test(value)) return { ok: false, problem: "characters" };

  return { ok: true, value };
}
