import { describe, expect, it } from "vitest";
import { parseReceivedEmailEvent } from "./parseReceivedEmailEvent";

const valid = {
  type: "email.received",
  created_at: "2026-11-05T12:00:01.000Z",
  data: {
    email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
    created_at: "2026-11-05T12:00:00.000Z",
    from: "noreply@github.com",
    to: ["teste@tmp.mateussiil.com.br"],
    cc: [],
    bcc: [],
    received_for: ["teste@tmp.mateussiil.com.br"],
    message_id: "<111-222@mail.github.com>",
    subject: "Seu código de verificação",
    attachments: [
      {
        id: "att-1",
        filename: "nota.pdf",
        content_type: "application/pdf",
        content_disposition: "attachment",
        content_id: null,
      },
    ],
  },
};

describe("parseReceivedEmailEvent", () => {
  it("lê um aviso completo", () => {
    expect(parseReceivedEmailEvent(valid)).toEqual({
      emailId: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      from: "noreply@github.com",
      to: ["teste@tmp.mateussiil.com.br"],
      cc: [],
      bcc: [],
      receivedFor: ["teste@tmp.mateussiil.com.br"],
      subject: "Seu código de verificação",
      messageId: "<111-222@mail.github.com>",
      receivedAt: new Date("2026-11-05T12:00:00.000Z"),
      attachments: [
        {
          id: "att-1",
          filename: "nota.pdf",
          contentType: "application/pdf",
          contentDisposition: "attachment",
          contentId: null,
          size: null,
        },
      ],
    });
  });

  it("usa padrões para o que falta e ignora lixo nas listas", () => {
    const event = parseReceivedEmailEvent({
      data: { email_id: "e1", from: "a@b.test", to: ["x@y.test", 42, null], attachments: "nada" },
    });

    expect(event).toEqual({
      emailId: "e1",
      from: "a@b.test",
      to: ["x@y.test"],
      cc: [],
      bcc: [],
      receivedFor: [],
      subject: "",
      messageId: null,
      receivedAt: null,
      attachments: [],
    });
  });

  it("descarta anexo sem id e data inválida", () => {
    const event = parseReceivedEmailEvent({
      data: {
        email_id: "e1",
        from: "a@b.test",
        created_at: "ontem",
        attachments: [{ filename: "sem-id.txt" }, "texto", null],
      },
    });

    expect(event?.attachments).toEqual([]);
    expect(event?.receivedAt).toBeNull();
  });

  it("recusa aviso sem id do email, sem remetente ou fora do formato", () => {
    expect(parseReceivedEmailEvent({ data: { from: "a@b.test" } })).toBeNull();
    expect(parseReceivedEmailEvent({ data: { email_id: "e1" } })).toBeNull();
    expect(parseReceivedEmailEvent({ data: null })).toBeNull();
    expect(parseReceivedEmailEvent({})).toBeNull();
    expect(parseReceivedEmailEvent(null)).toBeNull();
    expect(parseReceivedEmailEvent("texto")).toBeNull();
  });
});
