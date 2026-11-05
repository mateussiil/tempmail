import { randomInt } from "node:crypto";

// Sem letras e números que se confundem ao ditar ou ler (i, l, o, 0, 1).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Endereço aleatório de 8 caracteres, ex.: `k7f3qx9m` (cerca de 8,5 × 10¹¹ combinações). */
export function generateRandomAddress(length = 8): string {
  let address = "";
  for (let i = 0; i < length; i++) address += ALPHABET[randomInt(ALPHABET.length)];
  return address;
}
