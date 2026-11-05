import { describe, expect, it } from "vitest";
import { Message } from "../domain/Message";
import {
  FakeInboxDirectory,
  FakeMessageRepository,
  FakeRawEmailDownloader,
  FakeRawEmailStore,
  FakeReceivedEmailSource,
  emailContent,
  fail,
  ok,
} from "../testing/fakes";
import { ReceiveEmailUseCase } from "./ReceiveEmailUseCase";
import type { ReceivedEmailEvent } from "./ReceivedEmailEvent";
import { TransientError } from "./ports";

const NOW = new Date("2026-11-05T12:30:00Z");

function event(overrides: Partial<ReceivedEmailEvent> = {}): ReceivedEmailEvent {
  return {
    emailId: "email-1",
    from: "noreply@github.com",
    to: ["teste@tmp.exemplo.test"],
    cc: [],
    bcc: [],
    receivedFor: [],
    subject: "Seu código de verificação",
    messageId: "<msg-1@github.com>",
    receivedAt: new Date("2026-11-05T12:00:00Z"),
    attachments: [],
    ...overrides,
  };
}

function setup(inboxes = [{ id: "inbox-1", address: "teste", active: true, ownerId: "ana" }]) {
  const repository = new FakeMessageRepository();
  const source = new FakeReceivedEmailSource();
  const downloader = new FakeRawEmailDownloader();
  const store = new FakeRawEmailStore();
  const logs: string[] = [];
  const useCase = new ReceiveEmailUseCase({
    directory: new FakeInboxDirectory(inboxes),
    source,
    downloader,
    store,
    repository,
    mailDomain: "tmp.exemplo.test",
    maxMessageBytes: 10 * 1024 * 1024,
    clock: () => NOW,
    log: (name) => logs.push(name),
  });
  return { useCase, repository, source, downloader, store, logs };
}

describe("ReceiveEmailUseCase", () => {
  it("guarda o .eml no R2 e os campos prontos, com o código extraído", async () => {
    const s = setup();

    const outcome = await s.useCase.execute(event());

    const id = Message.idFor("email-1", "inbox-1");
    expect(outcome).toEqual({
      kind: "stored",
      messages: [{ id, inboxId: "inbox-1", status: "ready" }],
    });

    const message = s.repository.messages.get(id)!;
    expect(message).toMatchObject({
      inboxId: "inbox-1",
      emailId: "email-1",
      fromAddress: "noreply@github.com",
      fromHeader: "GitHub <noreply@github.com>",
      subject: "Seu código de verificação",
      verificationCode: "482913",
      status: "ready",
      rawKey: `caixas/inbox-1/${id}.eml`,
      messageId: "<msg-1@github.com>",
    });
    expect(message.receivedAt).toEqual(new Date("2026-11-05T12:00:00Z"));
    expect(message.createdAt).toEqual(NOW);
    expect(message.rawSize).toBe(s.store.objects.get(`caixas/inbox-1/${id}.eml`)!.byteLength);
  });

  it("guarda os metadados dos anexos, sem os bytes", async () => {
    const s = setup();
    const attachment = {
      id: "att-1",
      filename: "nota.pdf",
      contentType: "application/pdf",
      contentDisposition: null,
      contentId: null,
      size: 13264,
    };
    s.source.behavior = () => ok(emailContent({ attachments: [attachment] }));

    await s.useCase.execute(event());

    const [message] = [...s.repository.messages.values()];
    expect(message.attachments).toEqual([attachment]);
  });

  describe("destinatários", () => {
    it("descarta o email para endereço sem Caixa (Email órfão) sem buscar nada no Resend", async () => {
      const s = setup([]);

      const outcome = await s.useCase.execute(event());

      expect(outcome).toEqual({ kind: "orphan", addresses: ["teste"] });
      expect(s.source.calls).toBe(0);
      expect(s.downloader.calls).toBe(0);
      expect(s.repository.messages.size).toBe(0);
      expect(s.store.objects.size).toBe(0);
    });

    it("descarta o email para uma Caixa expirada", async () => {
      const s = setup([{ id: "inbox-1", address: "teste", active: false, ownerId: "ana" }]);

      const outcome = await s.useCase.execute(event());

      expect(outcome.kind).toBe("orphan");
      expect(s.source.calls).toBe(0);
    });

    it("ignora o email que não é para o nosso domínio", async () => {
      const s = setup();

      const outcome = await s.useCase.execute(event({ to: ["alguem@outro.test"] }));

      expect(outcome).toEqual({ kind: "not_for_us" });
      expect(s.source.calls).toBe(0);
    });

    it("não entrega para endereço com + (não existe Caixa assim)", async () => {
      const s = setup();

      const outcome = await s.useCase.execute(event({ to: ["teste+promo@tmp.exemplo.test"] }));

      expect(outcome.kind).toBe("orphan");
    });

    it("com `received_for` preenchido, entrega só para esse destinatário", async () => {
      const s = setup([
        { id: "inbox-1", address: "teste", active: true, ownerId: "ana" },
        { id: "inbox-2", address: "outra", active: true, ownerId: "bruno" },
      ]);

      await s.useCase.execute(
        event({
          receivedFor: ["teste@tmp.exemplo.test"],
          to: ["teste@tmp.exemplo.test", "outra@tmp.exemplo.test"],
        }),
      );

      expect([...s.repository.messages.values()].map((m) => m.inboxId)).toEqual(["inbox-1"]);
    });

    it("com vários destinatários, cria uma Mensagem por Caixa e baixa o .eml uma vez só", async () => {
      const s = setup([
        { id: "inbox-1", address: "teste", active: true, ownerId: "ana" },
        { id: "inbox-2", address: "outra", active: true, ownerId: "bruno" },
        { id: "inbox-3", address: "expirada", active: false, ownerId: "ana" },
      ]);

      const outcome = await s.useCase.execute(
        event({ to: ["teste@tmp.exemplo.test", "outra@tmp.exemplo.test", "expirada@tmp.exemplo.test"] }),
      );

      expect(outcome.kind === "stored" && outcome.messages).toHaveLength(2);
      expect(s.source.calls).toBe(1);
      expect(s.downloader.calls).toBe(1);
      expect([...s.store.objects.keys()].sort()).toEqual([
        `caixas/inbox-1/${Message.idFor("email-1", "inbox-1")}.eml`,
        `caixas/inbox-2/${Message.idFor("email-1", "inbox-2")}.eml`,
      ]);
    });
  });

  describe("idempotência", () => {
    it("reenviar o mesmo aviso não duplica nem busca de novo no Resend", async () => {
      const s = setup();
      await s.useCase.execute(event());

      const again = await s.useCase.execute(event());

      expect(again).toEqual({ kind: "duplicate" });
      expect(s.repository.messages.size).toBe(1);
      expect(s.source.calls).toBe(1);
      expect(s.downloader.calls).toBe(1);
    });

    it("emails diferentes na mesma Caixa viram Mensagens diferentes", async () => {
      const s = setup();

      await s.useCase.execute(event({ emailId: "email-1" }));
      await s.useCase.execute(event({ emailId: "email-2" }));

      expect(s.repository.messages.size).toBe(2);
    });

    it("uma nova tentativa depois de falha no meio completa só o que faltou", async () => {
      const s = setup([
        { id: "inbox-1", address: "teste", active: true, ownerId: "ana" },
        { id: "inbox-2", address: "outra", active: true, ownerId: "bruno" },
      ]);
      const second = `caixas/inbox-2/${Message.idFor("email-1", "inbox-2")}.eml`;
      s.store.failOn = (key) => key === second;
      const both = event({ to: ["teste@tmp.exemplo.test", "outra@tmp.exemplo.test"] });

      await expect(s.useCase.execute(both)).rejects.toThrow(/R2 indisponível/);
      expect(s.repository.messages.size).toBe(1); // a primeira já foi gravada

      s.store.failOn = () => false;
      const retry = await s.useCase.execute(both);

      expect(retry.kind === "stored" && retry.messages.map((m) => m.inboxId)).toEqual(["inbox-2"]);
      expect(s.repository.messages.size).toBe(2);
      expect(s.store.objects.has(second)).toBe(true);
    });

    it("se o R2 falha, a Mensagem não é gravada (então a nova tentativa refaz tudo)", async () => {
      const s = setup();
      s.store.failOn = () => true;

      await expect(s.useCase.execute(event())).rejects.toThrow();

      expect(s.repository.messages.size).toBe(0);
    });
  });

  describe("conteúdo indisponível", () => {
    it("cota do Resend estourada: guarda só os metadados do aviso", async () => {
      const s = setup();
      s.source.behavior = () => fail({ code: "quota_exceeded" });

      const outcome = await s.useCase.execute(
        event({ subject: "Pedido #1042", from: "Loja@Exemplo.test" }),
      );

      expect(outcome.kind === "stored" && outcome.messages[0].status).toBe("quota_exceeded");
      const [message] = [...s.repository.messages.values()];
      expect(message).toMatchObject({
        status: "quota_exceeded",
        subject: "Pedido #1042",
        fromAddress: "loja@exemplo.test",
        textBody: null,
        htmlBody: null,
        verificationCode: null,
        rawKey: null,
      });
      expect(s.downloader.calls).toBe(0);
      expect(s.store.objects.size).toBe(0);
    });

    it("acima do tamanho máximo: guarda só os metadados e nada no R2", async () => {
      const s = setup();
      s.downloader.behavior = () => ({ ok: false, reason: "too_large" });

      const outcome = await s.useCase.execute(event());

      expect(outcome.kind === "stored" && outcome.messages[0].status).toBe("too_large");
      expect([...s.repository.messages.values()][0]).toMatchObject({
        status: "too_large",
        htmlBody: null,
        rawKey: null,
      });
      expect(s.store.objects.size).toBe(0);
    });

    it("passa o limite de tamanho ao baixar o .eml", async () => {
      const s = setup();
      let received = 0;
      s.downloader.behavior = (_url, maxBytes) => {
        received = maxBytes;
        return { ok: true, bytes: new Uint8Array([1]) };
      };

      await s.useCase.execute(event());

      expect(received).toBe(10 * 1024 * 1024);
    });

    it("email que o Resend não conhece: não grava e não pede nova tentativa", async () => {
      const s = setup();
      s.source.behavior = () => fail({ code: "not_found" });

      const outcome = await s.useCase.execute(event());

      expect(outcome).toEqual({ kind: "email_not_found" });
      expect(s.repository.messages.size).toBe(0);
    });

    it("sem link do .eml, grava a Mensagem pronta, sem arquivo no R2", async () => {
      const s = setup();
      s.source.behavior = () => ok(emailContent({ rawDownloadUrl: null }));

      await s.useCase.execute(event());

      const [message] = [...s.repository.messages.values()];
      expect(message).toMatchObject({ status: "ready", rawKey: null, rawSize: null });
      expect(s.downloader.calls).toBe(0);
    });
  });

  describe("falhas passageiras", () => {
    it("deixa subir o erro do Resend, sem gravar nada, pro webhook pedir reenvio", async () => {
      const s = setup();
      s.source.behavior = () => {
        throw new TransientError("Resend respondeu 503");
      };

      await expect(s.useCase.execute(event())).rejects.toBeInstanceOf(TransientError);

      expect(s.repository.messages.size).toBe(0);
    });

    it("deixa subir a falha do download do .eml", async () => {
      const s = setup();
      s.downloader.behavior = () => {
        throw new TransientError("download falhou");
      };

      await expect(s.useCase.execute(event())).rejects.toBeInstanceOf(TransientError);

      expect(s.repository.messages.size).toBe(0);
    });
  });
});
