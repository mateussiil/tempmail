import { decodeEntities } from "./htmlToText";

/** Palavras que indicam um link de confirmação, login ou redefinição. */
const ACTION_WORDS =
  /verif|confirm|activat|ativa|magic|login|log-in|signin|sign-in|sign_in|auth|token|reset|redefin|valid|invite|convite|entrar|acess/i;

/** Links que quase nunca são o que se procura num email de verificação. */
const NOISE = /unsubscribe|descadastr|optout|opt-out|preferences|prefer[eê]ncias|privacy|privacidade|\.(png|jpe?g|gif|svg|webp|css|ico)(\?|$)/i;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]{}]+/gi;
const HREF = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export const MAX_LINKS = 20;

function normalize(raw: string): string | null {
  // Pontuação no fim de uma frase não faz parte do link.
  const trimmed = decodeEntities(raw.trim()).replace(/[.,;:!?]+$/, "");
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Os links de uma Mensagem que parecem de confirmação (verificar, entrar,
 * redefinir senha…) vêm primeiro; depois os outros, sem os de descadastro e de
 * imagens. Só `http` e `https`, sem repetição, até {@link MAX_LINKS}.
 *
 * O conteúdo é de terceiros: quem usar os links decide se segue algum.
 */
export function extractVerificationLinks(input: { text: string | null; html: string | null }): string[] {
  const found: string[] = [];

  if (input.html) {
    for (const match of input.html.matchAll(HREF)) {
      const link = normalize(match[1] ?? match[2] ?? match[3] ?? "");
      if (link) found.push(link);
    }
  }
  if (input.text) {
    for (const match of input.text.matchAll(URL_IN_TEXT)) {
      const link = normalize(match[0]);
      if (link) found.push(link);
    }
  }

  const unique = [...new Set(found)].filter((link) => !NOISE.test(link));
  const actions = unique.filter((link) => ACTION_WORDS.test(link));
  const others = unique.filter((link) => !ACTION_WORDS.test(link));
  return [...actions, ...others].slice(0, MAX_LINKS);
}
