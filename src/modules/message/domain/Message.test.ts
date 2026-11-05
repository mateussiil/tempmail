import { describe, expect, it } from "vitest";
import { Message } from "./Message";

const base = {
  inboxId: "inbox-1",
  emailId: "email-1",
  messageId: "<abc@mail.example>",
  fromAddress: "noreply@github.com",
  subject: "Seu código de verificação",
  attachments: [],
  receivedAt: new Date("2026-11-05T12:00:00Z"),
  createdAt: new Date("2026-11-05T12:00:01Z"),
};

describe("Message", () => {
  it("gera o mesmo id para o mesmo email na mesma Caixa, e ids diferentes caso contrário", () => {
    const a = Message.idFor("email-1", "inbox-1");

    expect(a).toBe(Message.idFor("email-1", "inbox-1"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(Message.idFor("email-1", "inbox-2")).not.toBe(a);
    expect(Message.idFor("email-2", "inbox-1")).not.toBe(a);
  });

  it("não confunde 'a:bc' com 'ab:c' ao derivar o id", () => {
    expect(Message.idFor("a", "bc")).not.toBe(Message.idFor("ab", "c"));
  });

  it("monta o caminho do .eml no R2 por Caixa", () => {
    expect(Message.rawKeyFor("inbox-1", "msg-1")).toBe("caixas/inbox-1/msg-1.eml");
  });

  it("a Mensagem pronta extrai o código de verificação do corpo", () => {
    const message = Message.ready({
      ...base,
      fromHeader: "GitHub <noreply@github.com>",
      textBody: "Use o código 482913 para confirmar.",
      htmlBody: null,
      rawKey: "caixas/inbox-1/x.eml",
      rawSize: 1234,
    });

    expect(message.status).toBe("ready");
    expect(message.verificationCode).toBe("482913");
    expect(message.id).toBe(Message.idFor("email-1", "inbox-1"));
    expect(message.fromHeader).toBe("GitHub <noreply@github.com>");
  });

  it("a Mensagem pronta sem código fica com código nulo", () => {
    const message = Message.ready({
      ...base,
      subject: "Pedido confirmado",
      fromHeader: null,
      textBody: "Obrigado pela compra.",
      htmlBody: null,
      rawKey: null,
      rawSize: null,
    });

    expect(message.verificationCode).toBeNull();
  });

  it("a Mensagem sem conteúdo guarda só os metadados", () => {
    const message = Message.withoutContent(base, "quota_exceeded");

    expect(message).toMatchObject({
      status: "quota_exceeded",
      textBody: null,
      htmlBody: null,
      verificationCode: null,
      rawKey: null,
      rawSize: null,
      fromAddress: "noreply@github.com",
      subject: "Seu código de verificação",
    });
    expect(Message.withoutContent(base, "too_large").status).toBe("too_large");
  });
});
