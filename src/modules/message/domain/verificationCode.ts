import { htmlToText } from "./htmlToText";

const KEYWORDS =
  "c[óo]digo|code|verifica[cç][ãa]o|verification|verify|otp|pin|senha|password|passcode|token|confirma[cç][ãa]o|confirmation|seguran[cç]a|security";

// 4 a 8 dígitos, ou 3+3 / 4+4 separados por espaço ou hífen ("771 204").
// Recusa o que parece data, hora ou número com separador ("2026-11-05", "1.042,00").
const CODE =
  "(?<!\\d)(?<!\\d[.,/:-])(\\d{3}[ \\u00a0-]\\d{3}|\\d{4}[ \\u00a0-]\\d{4}|\\d{4,8})(?!\\d)(?![.,/:-]\\d)";

/** "código: 482913", "Seu código de login: 771 204", "Your verification code is 123456". */
const CODE_AFTER_KEYWORD = new RegExp(`(?:${KEYWORDS})[^\\d\\n]{0,40}?${CODE}`, "i");

/** "482913 é o seu código", "123456 is your verification code", "771204 is your Notion login code". */
const CODE_BEFORE_KEYWORD = new RegExp(
  `${CODE}\\s+(?:é|e|is|es)\\s+(?:(?:o|a|your|seu|sua|tu)\\s+)*(?:[\\w\\u00C0-\\u00FF'-]+\\s+){0,4}?(?:${KEYWORDS})`,
  "i",
);

const HAS_KEYWORD = new RegExp(KEYWORDS, "i");
// Código sozinho numa linha (o formato comum de email): só 6 dígitos, o tamanho
// mais usado, pra não pegar um ano ou um valor solto.
const STANDALONE_LINE = /^(\d{6}|\d{3}[  -]\d{3})$/;

function normalize(code: string): string {
  return code.replace(/[  -]/g, "");
}

function standaloneCode(text: string): string | null {
  for (const line of text.split("\n")) {
    const match = STANDALONE_LINE.exec(line.trim());
    if (match) return normalize(match[1]);
  }
  return null;
}

/**
 * Procura o código de verificação (OTP) de uma Mensagem: números de 4 a 8
 * dígitos perto de palavras como "código", "code" ou "verification", no assunto
 * primeiro e depois no corpo. É heurística: sem palavra de contexto, não adivinha.
 */
export function extractVerificationCode(input: {
  subject: string;
  text: string | null;
  html: string | null;
}): string | null {
  const body = input.text?.trim() ? input.text : input.html ? htmlToText(input.html) : "";
  const sources = [input.subject, body];

  for (const pattern of [CODE_AFTER_KEYWORD, CODE_BEFORE_KEYWORD]) {
    for (const source of sources) {
      const match = pattern.exec(source);
      if (match) return normalize(match[1]);
    }
  }

  if (HAS_KEYWORD.test(`${input.subject}\n${body}`)) return standaloneCode(body);
  return null;
}
