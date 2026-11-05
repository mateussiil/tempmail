import { describe, expect, it } from "vitest";
import { Message } from "../domain/Message";
import { FakeInboxDirectory, FakeMessageRepository } from "../testing/fakes";
import { GetMessageUseCase } from "./GetMessageUseCase";
import { ListMessagesUseCase } from "./ListMessagesUseCase";

function message(emailId: string, inboxId: string, minute: number, overrides = {}): Message {
  return Message.ready({
    inboxId,
    emailId,
    messageId: null,
    fromAddress: "noreply@github.com",
    fromHeader: "GitHub <noreply@github.com>",
    subject: `Assunto ${emailId}`,
    textBody: "Use o código 482913",
    htmlBody: "<p>oi</p>",
    rawKey: "caixas/x/y.eml",
    rawSize: 10,
    attachments: [],
    receivedAt: new Date(Date.UTC(2026, 10, 5, 12, minute)),
    createdAt: new Date(Date.UTC(2026, 10, 5, 12, minute)),
    ...overrides,
  });
}

function setup() {
  const repository = new FakeMessageRepository();
  const directory = new FakeInboxDirectory([
    { id: "inbox-ana", address: "da-ana", active: true, ownerId: "ana" },
    { id: "inbox-ana-expirada", address: "velha", active: false, ownerId: "ana" },
    { id: "inbox-bruno", address: "do-bruno", active: true, ownerId: "bruno" },
  ]);
  return {
    repository,
    list: new ListMessagesUseCase({ directory, repository }),
    get: new GetMessageUseCase({ directory, repository }),
  };
}

describe("ListMessagesUseCase", () => {
  it("lista as Mensagens da Caixa, as mais recentes primeiro, sem o corpo", async () => {
    const s = setup();
    await s.repository.insert(message("e1", "inbox-ana", 1));
    await s.repository.insert(message("e3", "inbox-ana", 3));
    await s.repository.insert(message("e2", "inbox-ana", 2));
    await s.repository.insert(message("e9", "inbox-bruno", 9));

    const result = await s.list.execute({ ownerId: "ana", inboxId: "inbox-ana" });

    expect(result.ok && result.value.map((m) => m.subject)).toEqual([
      "Assunto e3",
      "Assunto e2",
      "Assunto e1",
    ]);
    expect(result.ok && result.value[0]).toEqual({
      id: Message.idFor("e3", "inbox-ana"),
      inboxId: "inbox-ana",
      from: "GitHub <noreply@github.com>",
      fromAddress: "noreply@github.com",
      subject: "Assunto e3",
      receivedAt: "2026-11-05T12:03:00.000Z",
      verificationCode: "482913",
      status: "ready",
      attachmentCount: 0,
    });
    expect(result.ok && "html" in result.value[0]).toBe(false);
  });

  it("respeita o limite, que fica entre 1 e 100", async () => {
    const s = setup();
    for (let i = 1; i <= 5; i++) await s.repository.insert(message(`e${i}`, "inbox-ana", i));

    const two = await s.list.execute({ ownerId: "ana", inboxId: "inbox-ana", limit: 2 });
    const zero = await s.list.execute({ ownerId: "ana", inboxId: "inbox-ana", limit: 0 });

    expect(two.ok && two.value).toHaveLength(2);
    expect(zero.ok && zero.value).toHaveLength(1);
  });

  it("mostra o remetente só pelo endereço quando não há nome", async () => {
    const s = setup();
    await s.repository.insert(message("e1", "inbox-ana", 1, { fromHeader: null }));

    const result = await s.list.execute({ ownerId: "ana", inboxId: "inbox-ana" });

    expect(result.ok && result.value[0].from).toBe("noreply@github.com");
  });

  it("trata a Caixa de outro Membro e uma inexistente como não encontradas", async () => {
    const s = setup();

    expect(await s.list.execute({ ownerId: "ana", inboxId: "inbox-bruno" })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await s.list.execute({ ownerId: "ana", inboxId: "nada" })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("uma Caixa expirada não tem Mensagens, mesmo que ainda estejam no banco", async () => {
    const s = setup();
    await s.repository.insert(message("e1", "inbox-ana-expirada", 1));

    const result = await s.list.execute({ ownerId: "ana", inboxId: "inbox-ana-expirada" });

    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe("GetMessageUseCase", () => {
  it("devolve a Mensagem completa ao Dono da Caixa", async () => {
    const s = setup();
    const m = message("e1", "inbox-ana", 1, {
      attachments: [
        { id: "a1", filename: "nota.pdf", contentType: "application/pdf", contentDisposition: null, contentId: null, size: 99 },
      ],
    });
    await s.repository.insert(m);

    const result = await s.get.execute({ ownerId: "ana", messageId: m.id });

    expect(result.ok && result.value).toMatchObject({
      id: m.id,
      text: "Use o código 482913",
      html: "<p>oi</p>",
      verificationCode: "482913",
      hasRaw: true,
      attachmentCount: 1,
      attachments: [{ id: "a1", filename: "nota.pdf", size: 99 }],
    });
  });

  it("marca que não há .eml guardado", async () => {
    const s = setup();
    const m = message("e1", "inbox-ana", 1, { rawKey: null, rawSize: null });
    await s.repository.insert(m);

    const result = await s.get.execute({ ownerId: "ana", messageId: m.id });

    expect(result.ok && result.value.hasRaw).toBe(false);
  });

  it("não mostra a Mensagem de outro Membro, uma inexistente nem a de Caixa expirada", async () => {
    const s = setup();
    const alheia = message("e1", "inbox-bruno", 1);
    const daExpirada = message("e2", "inbox-ana-expirada", 2);
    await s.repository.insert(alheia);
    await s.repository.insert(daExpirada);

    for (const messageId of [alheia.id, daExpirada.id, "nada"]) {
      expect(await s.get.execute({ ownerId: "ana", messageId })).toEqual({
        ok: false,
        error: { code: "not_found" },
      });
    }
  });
});
