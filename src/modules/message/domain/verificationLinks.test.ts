import { describe, expect, it } from "vitest";
import { extractVerificationLinks, MAX_LINKS } from "./verificationLinks";

describe("extractVerificationLinks", () => {
  it("põe os links de confirmação antes dos outros", () => {
    const links = extractVerificationLinks({
      text: null,
      html: `
        <a href="https://exemplo.test/blog">Blog</a>
        <a href='https://exemplo.test/verify?token=abc&amp;u=1'>Confirmar</a>
      `,
    });

    expect(links).toEqual(["https://exemplo.test/verify?token=abc&u=1", "https://exemplo.test/blog"]);
  });

  it("acha links no texto e tira a pontuação do fim da frase", () => {
    expect(
      extractVerificationLinks({ text: "Entre em https://app.test/magic-link/xyz. Obrigado!", html: null }),
    ).toEqual(["https://app.test/magic-link/xyz"]);
  });

  it("ignora descadastro, imagens, mailto e javascript, sem repetir", () => {
    const links = extractVerificationLinks({
      text: "https://app.test/login/1",
      html: `
        <a href="https://app.test/login/1">Entrar</a>
        <a href="https://app.test/unsubscribe?u=1">Sair da lista</a>
        <a href="https://cdn.test/logo.png">logo</a>
        <a href="mailto:a@b.test">email</a>
        <a href="javascript:alert(1)">x</a>
      `,
    });

    expect(links).toEqual(["https://app.test/login/1"]);
  });

  it("sem corpo, devolve lista vazia", () => {
    expect(extractVerificationLinks({ text: null, html: null })).toEqual([]);
  });

  it(`devolve no máximo ${MAX_LINKS} links`, () => {
    const text = Array.from({ length: 30 }, (_, i) => `https://app.test/p/${i}`).join(" ");
    expect(extractVerificationLinks({ text, html: null })).toHaveLength(MAX_LINKS);
  });
});
