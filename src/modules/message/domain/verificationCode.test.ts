import { describe, expect, it } from "vitest";
import { extractVerificationCode } from "./verificationCode";

const extract = (subject: string, text: string | null = null, html: string | null = null) =>
  extractVerificationCode({ subject, text, html });

describe("extractVerificationCode", () => {
  describe("palavra de contexto antes do código", () => {
    it("acha o código no assunto", () => {
      expect(extract("Seu código de login: 771 204")).toBe("771204");
      expect(extract("Your verification code is 123456")).toBe("123456");
      expect(extract("Código: 4821")).toBe("4821");
    });

    it("acha o código no corpo em texto", () => {
      expect(extract("Confirme seu email", "Use o código 482913 para terminar o cadastro.")).toBe(
        "482913",
      );
      expect(extract("Welcome", "Your one-time passcode: 998877. It expires in 10 minutes.")).toBe(
        "998877",
      );
    });

    it("acha o código no corpo só em HTML", () => {
      const html = "<p>Seu <b>código de verificação</b> é:</p><h1>502 913</h1>";

      expect(extract("Confirmação", null, html)).toBe("502913");
    });

    it("junta o código separado por espaço ou hífen", () => {
      expect(extract("Código 123 456")).toBe("123456");
      expect(extract("Code: 123-456")).toBe("123456");
      expect(extract("Código 1234 5678")).toBe("12345678");
    });

    it("aceita de 4 a 8 dígitos", () => {
      expect(extract("code 1234")).toBe("1234");
      expect(extract("code 12345678")).toBe("12345678");
    });

    it("não pega número grande demais nem pedaço de um número maior", () => {
      expect(extract("código de rastreio 123456789")).toBeNull();
      expect(extract("code 123")).toBeNull();
    });

    it("não pega datas, horas nem valores perto da palavra", () => {
      expect(extract("Sua senha expira em 2026-11-05")).toBeNull();
      expect(extract("Your token expires at 12:30:45")).toBeNull();
      expect(extract("Senha: R$ 1.042,00 no total")).toBeNull();
    });
  });

  describe("código antes da palavra de contexto", () => {
    it("não pega número solto que só aparece longe de uma palavra de contexto", () => {
      expect(extract("Pedido", "1042 é o número do seu pedido, que sai amanhã. Qualquer coisa, fale.")).toBeNull();
    });

    it("acha 'N é o seu código' e 'N is your code'", () => {
      expect(extract("482913 é o seu código de verificação")).toBe("482913");
      expect(extract("123456 is your verification code")).toBe("123456");
      expect(extract("Hi", "771204 is your Notion login code")).toBe("771204");
    });
  });

  describe("código sozinho numa linha", () => {
    it("acha um código de 6 dígitos quando há palavra de contexto em algum lugar", () => {
      expect(extract("Seu código de verificação", "Olá,\n\n482913\n\nEle expira em 10 minutos.")).toBe(
        "482913",
      );
      expect(extract("Verify your email", null, "<p>Enter this:</p><div>123 456</div>")).toBe(
        "123456",
      );
    });

    it("não adivinha sem palavra de contexto", () => {
      expect(extract("Pedido confirmado", "Seu pedido\n\n482913\n\nsegue em anexo.")).toBeNull();
    });

    it("só aceita 6 dígitos sozinhos, pra não pegar ano nem valor", () => {
      expect(extract("Your verification code", "© 2026\n\n2026\n\n12345678")).toBeNull();
    });
  });

  describe("sem código", () => {
    it("devolve nulo para emails comuns", () => {
      expect(extract("Pedido #1042 confirmado", "Obrigado pela compra. Total: R$ 1.042,00")).toBeNull();
      expect(extract("Fatura de novembro", null, "<p>Vencimento 05/11/2026</p>")).toBeNull();
      expect(extract("", null, null)).toBeNull();
    });

    it("prefere o código do assunto ao do corpo", () => {
      expect(extract("Código 111111", "Use o código 222222")).toBe("111111");
    });
  });

  describe("formato real dos emails de teste (Gmail, texto com *negrito*)", () => {
    it("acha o código entre asteriscos", () => {
      expect(extract("teste texto puro 2", "Seu código de verificação é *771204*.")).toBe("771204");
      expect(extract("Confirme", "Use o código\n\n*482913*\n\npara entrar.")).toBe("482913");
    });
  });
});
