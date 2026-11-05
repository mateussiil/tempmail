import { describe, expect, it } from "vitest";
import { Message } from "../domain/Message";
import { FakeInboxDirectory, FakeMessageRepository, FakeNewMessageSignal } from "../testing/fakes";
import { WaitForMessageUseCase, type WaitInput } from "./WaitForMessageUseCase";

function message(
  emailId: string,
  createdAt: Date,
  overrides: Partial<Parameters<typeof Message.ready>[0]> = {},
): Message {
  return Message.ready({
    inboxId: "inbox-ana",
    emailId,
    messageId: null,
    fromAddress: "noreply@github.com",
    fromHeader: "GitHub <noreply@github.com>",
    subject: "Seu código de verificação",
    textBody: "Use o código 482913 ou entre em https://github.test/verify?t=1",
    htmlBody: null,
    rawKey: null,
    rawSize: null,
    attachments: [],
    receivedAt: createdAt,
    createdAt,
    ...overrides,
  });
}

function setup(options: { progressIntervalMs?: number } = {}) {
  const repository = new FakeMessageRepository();
  const signal = new FakeNewMessageSignal();
  const directory = new FakeInboxDirectory([
    { id: "inbox-ana", address: "da-ana", active: true, ownerId: "ana" },
    { id: "inbox-velha", address: "velha", active: false, ownerId: "ana" },
    { id: "inbox-bruno", address: "do-bruno", active: true, ownerId: "bruno" },
  ]);
  const wait = new WaitForMessageUseCase({
    directory,
    repository,
    signal,
    clock: () => new Date(),
    progressIntervalMs: options.progressIntervalMs ?? 1_000,
  });

  /** Grava e avisa, como o recebimento faz. */
  const deliver = async (m: Message) => {
    await repository.insert(m);
    signal.emit(m.inboxId);
  };

  const run = (input: Partial<WaitInput> = {}) =>
    wait.execute({ ownerId: "ana", inboxId: "inbox-ana", timeoutMs: 2_000, ...input });

  return { repository, signal, deliver, run };
}

const ago = (ms: number) => new Date(Date.now() - ms);

describe("WaitForMessageUseCase", () => {
  it("devolve na hora uma Mensagem que já estava na Caixa, sem escutar", async () => {
    const s = setup();
    await s.repository.insert(message("e1", ago(5_000)));

    const result = await s.run();

    expect(result.ok && result.value.status).toBe("received");
    if (!result.ok || result.value.status !== "received") return;
    expect(result.value.message.verificationCode).toBe("482913");
    expect(result.value.message.links).toEqual(["https://github.test/verify?t=1"]);
    expect(result.value.message.preview).toContain("482913");
    expect(s.signal.active).toBe(0);
  });

  it("espera a próxima Mensagem e devolve o código já extraído", async () => {
    const s = setup();
    const pending = s.run();
    await new Promise((r) => setTimeout(r, 20));

    await s.deliver(message("e1", new Date()));
    const result = await pending;

    expect(result.ok && result.value.status === "received" && result.value.message.verificationCode).toBe(
      "482913",
    );
    expect(s.signal.active).toBe(0);
  });

  it("não perde a Mensagem que chega entre a primeira consulta e a escuta", async () => {
    const s = setup();
    s.signal.afterSubscribe = async () => {
      // Grava sem avisar: só a segunda consulta, feita depois de escutar, pode achá-la.
      await s.repository.insert(message("e1", new Date()));
    };

    const started = Date.now();
    const result = await s.run({ timeoutMs: 5_000 });

    expect(result.ok && result.value.status).toBe("received");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("sem email no prazo, devolve timeout (não é erro) com um cursor pra chamar de novo", async () => {
    const s = setup();
    const before = new Date();

    const result = await s.run({ timeoutMs: 100 });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== "timeout") throw new Error("esperava timeout");
    expect(new Date(result.value.cursor).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(s.signal.active).toBe(0);
  });

  it("com cursor, ignora o que já foi visto e pega a seguinte, na ordem de chegada", async () => {
    const s = setup();
    const first = message("e1", ago(3_000));
    await s.repository.insert(first);
    const second = message("e2", ago(2_000), { subject: "Segundo" });
    await s.repository.insert(second);
    await s.repository.insert(message("e3", ago(1_000), { subject: "Terceiro" }));

    const result = await s.run({ since: first.createdAt });

    expect(result.ok && result.value.status === "received" && result.value.message.subject).toBe("Segundo");
    expect(result.ok && result.value.status === "received" && result.value.cursor).toBe(
      second.createdAt.toISOString(),
    );
  });

  it("um timeout com cursor devolve o mesmo cursor", async () => {
    const s = setup();
    const since = ago(1_000);

    const result = await s.run({ since, timeoutMs: 50 });

    expect(result.ok && result.value.status === "timeout" && result.value.cursor).toBe(since.toISOString());
  });

  it("filtra por remetente e assunto, sem diferenciar maiúsculas", async () => {
    const s = setup();
    await s.repository.insert(message("e1", ago(2_000), { fromAddress: "news@loja.test", fromHeader: null }));
    await s.repository.insert(message("e2", ago(1_000), { subject: "Promoção" }));
    const pending = s.run({ fromContains: "GITHUB", subjectContains: "código" });
    await new Promise((r) => setTimeout(r, 20));

    await s.deliver(message("e3", new Date(), { subject: "Seu código chegou" }));
    const result = await pending;

    expect(result.ok && result.value.status === "received" && result.value.message.subject).toBe(
      "Seu código chegou",
    );
  });

  it("Mensagem sem conteúdo por cota devolve content_unavailable em vez de continuar esperando", async () => {
    const s = setup();
    await s.repository.insert(
      Message.withoutContent(
        {
          inboxId: "inbox-ana",
          emailId: "e1",
          messageId: null,
          fromAddress: "noreply@github.com",
          subject: "Seu código",
          attachments: [],
          receivedAt: ago(1_000),
          createdAt: ago(1_000),
        },
        "quota_exceeded",
      ),
    );

    const result = await s.run();

    expect(result.ok && result.value).toMatchObject({
      status: "content_unavailable",
      reason: "quota_exceeded",
      message: { subject: "Seu código", verificationCode: null },
    });
  });

  it("avisa o progresso enquanto espera e confere o banco mesmo sem aviso", async () => {
    const s = setup({ progressIntervalMs: 40 });
    const progress: number[] = [];
    const pending = s.run({ timeoutMs: 1_000, onProgress: (ms) => void progress.push(ms) });
    await new Promise((r) => setTimeout(r, 100));

    // Grava sem NOTIFY (a escuta pode ter caído): a conferência periódica acha.
    await s.repository.insert(message("e1", new Date()));
    const result = await pending;

    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(result.ok && result.value.status).toBe("received");
  });

  it("uma falha ao avisar o progresso não derruba a espera", async () => {
    const s = setup({ progressIntervalMs: 10 });

    const result = await s.run({
      timeoutMs: 60,
      onProgress: () => {
        throw new Error("cliente foi embora");
      },
    });

    expect(result.ok && result.value.status).toBe("timeout");
  });

  it("para quando o pedido é cancelado e fecha a escuta", async () => {
    const s = setup();
    const controller = new AbortController();
    const pending = s.run({ timeoutMs: 10_000, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 20));

    controller.abort();
    const result = await pending;

    expect(result.ok && result.value.status).toBe("cancelled");
    expect(s.signal.active).toBe(0);
  });

  it("a Caixa de outro Membro e uma inexistente respondem not_found", async () => {
    const s = setup();

    expect(await s.run({ inboxId: "inbox-bruno" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await s.run({ inboxId: "nao-existe" })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("uma Caixa expirada não espera: devolve inbox_expired", async () => {
    const s = setup();

    expect(await s.run({ inboxId: "inbox-velha" })).toEqual({ ok: false, error: { code: "inbox_expired" } });
    expect(s.signal.active).toBe(0);
  });

  it("não acorda com Mensagem de outra Caixa", async () => {
    const s = setup();
    const pending = s.run({ timeoutMs: 150 });
    await new Promise((r) => setTimeout(r, 20));

    await s.deliver(message("e1", new Date(), { inboxId: "inbox-bruno" }));
    const result = await pending;

    expect(result.ok && result.value.status).toBe("timeout");
  });
});
