// @vitest-environment node
import { describe, expect, it } from "vitest";
import { InboxRepositoryDirectory } from "@/composition/inboxDirectory";
import { CreateInboxUseCase } from "@/modules/inbox/application/CreateInboxUseCase";
import { DeleteInboxUseCase } from "@/modules/inbox/application/DeleteInboxUseCase";
import { ListInboxesUseCase } from "@/modules/inbox/application/ListInboxesUseCase";
import { SetInboxKeptUseCase } from "@/modules/inbox/application/SetInboxKeptUseCase";
import { makeInboxDeps } from "@/modules/inbox/testing/inboxTestDeps";
import { GetMessageUseCase } from "@/modules/message/application/GetMessageUseCase";
import { ListMessagesUseCase } from "@/modules/message/application/ListMessagesUseCase";
import { WaitForMessageUseCase } from "@/modules/message/application/WaitForMessageUseCase";
import { Message } from "@/modules/message/domain/Message";
import { FakeMessageRepository, FakeNewMessageSignal } from "@/modules/message/testing/fakes";
import { mcpTestClient } from "../testing/mcpTestClient";

function message(inboxId: string, emailId: string, overrides: Partial<Parameters<typeof Message.ready>[0]> = {}) {
  const now = new Date();
  return Message.ready({
    inboxId,
    emailId,
    messageId: null,
    fromAddress: "noreply@github.com",
    fromHeader: "GitHub <noreply@github.com>",
    subject: "Seu código de verificação",
    textBody: "Use o código 482913. Ou confirme em https://github.test/verify?t=abc",
    htmlBody: '<p>Use o código <b>482913</b>. <a href="https://github.test/verify?t=abc">Confirmar</a></p>',
    rawKey: null,
    rawSize: null,
    attachments: [],
    receivedAt: now,
    createdAt: now,
    ...overrides,
  });
}

function setup() {
  const inbox = makeInboxDeps();
  const messages = new FakeMessageRepository();
  const signal = new FakeNewMessageSignal();
  const directory = new InboxRepositoryDirectory(inbox.repository, inbox.deps.clock);

  const client = mcpTestClient({
    webBaseUrl: "https://tempmail.exemplo.test/",
    createInbox: new CreateInboxUseCase(inbox.deps),
    listInboxes: new ListInboxesUseCase(inbox.deps),
    setInboxKept: new SetInboxKeptUseCase(inbox.deps),
    deleteInbox: new DeleteInboxUseCase(inbox.deps),
    listMessages: new ListMessagesUseCase({ directory, repository: messages }),
    getMessage: new GetMessageUseCase({ directory, repository: messages }),
    waitForMessage: new WaitForMessageUseCase({
      directory,
      repository: messages,
      signal,
      clock: () => new Date(),
      progressIntervalMs: 30,
    }),
  });

  const createInbox = async (memberId = "ana", address?: string) => {
    const { result } = await client.call("create_inbox", address ? { address } : {}, { memberId });
    return result.structuredContent!.inbox as { id: string; fullAddress: string };
  };

  const deliver = async (m: Message) => {
    await messages.insert(m);
    signal.emit(m.inboxId);
  };

  return { client, messages, signal, createInbox, deliver, advanceHours: inbox.advanceHours };
}

describe("ferramentas MCP", () => {
  it("expõe as ferramentas do ticket, com apagar marcada como destrutiva", async () => {
    const tools = await setup().client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_inbox",
      "delete_inbox",
      "extract_code",
      "get_message",
      "keep_inbox",
      "list_inboxes",
      "list_messages",
      "view_message",
      "wait_for_email",
    ]);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
    expect(byName.delete_inbox.destructiveHint).toBe(true);
    for (const name of ["list_inboxes", "list_messages", "get_message", "extract_code", "wait_for_email"]) {
      expect(byName[name].readOnlyHint).toBe(true);
    }
  });

  it("cria, lista, mantém e apaga Caixas", async () => {
    const s = setup();

    const created = await s.client.call("create_inbox", { address: "Meu-Teste" });
    expect(created.result.isError).toBeFalsy();
    expect(created.result.structuredContent).toMatchObject({
      inbox: { address: "meu-teste", fullAddress: "meu-teste@tmp.exemplo.test", status: "active" },
      reactivated: false,
    });
    const id = (created.result.structuredContent!.inbox as { id: string }).id;

    const kept = await s.client.call("keep_inbox", { inbox_id: id });
    expect(kept.result.structuredContent).toMatchObject({ inbox: { kept: true, expiresAt: null } });

    const deleted = await s.client.call("delete_inbox", { inbox_id: id });
    expect(deleted.result.structuredContent).toMatchObject({ inbox: { status: "expired" } });

    const active = await s.client.call("list_inboxes");
    expect(active.result.structuredContent).toEqual({ inboxes: [] });
    const all = await s.client.call("list_inboxes", { include_expired: true });
    expect((all.result.structuredContent!.inboxes as unknown[]).length).toBe(1);
  });

  it("erros de negócio voltam como resultado de erro da ferramenta, com código e mensagem", async () => {
    const s = setup();

    const invalid = await s.client.call("create_inbox", { address: "a" });
    expect(invalid.result.isError).toBe(true);
    expect(invalid.result.structuredContent).toMatchObject({ error: "invalid_address" });

    const missing = await s.client.call("keep_inbox", { inbox_id: "nao-existe" });
    expect(missing.result.structuredContent).toMatchObject({ error: "not_found", message: "Caixa não encontrada." });
  });

  it("cada Membro só enxerga as próprias Caixas e Mensagens", async () => {
    const s = setup();
    const inbox = await s.createInbox("ana");
    const m = message(inbox.id, "e1");
    await s.messages.insert(m);
    const asBruno = { memberId: "bruno" };

    expect((await s.client.call("list_inboxes", {}, asBruno)).result.structuredContent).toEqual({ inboxes: [] });
    for (const [tool, args] of [
      ["list_messages", { inbox_id: inbox.id }],
      ["get_message", { message_id: m.id }],
      ["extract_code", { message_id: m.id }],
      ["wait_for_email", { inbox_id: inbox.id, timeout_seconds: 1 }],
      ["keep_inbox", { inbox_id: inbox.id }],
      ["delete_inbox", { inbox_id: inbox.id }],
    ] as const) {
      const { result } = await s.client.call(tool, args, asBruno);
      expect(result.isError, tool).toBe(true);
      expect(result.structuredContent?.error, tool).toBe("not_found");
    }

    // E a Caixa continua ativa para a Ana.
    const own = await s.client.call("list_inboxes");
    expect((own.result.structuredContent!.inboxes as unknown[]).length).toBe(1);
  });

  it("sem Membro autenticado, nada é visível", async () => {
    const { result } = await setup().client.call("list_inboxes", {}, { memberId: null });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: "unauthenticated" });
  });

  it("lista as Mensagens sem o corpo", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    await s.messages.insert(message(inbox.id, "e1"));

    const { result } = await s.client.call("list_messages", { inbox_id: inbox.id });

    const [item] = result.structuredContent!.messages as Record<string, unknown>[];
    expect(item).toMatchObject({ subject: "Seu código de verificação", verificationCode: "482913" });
    expect(item).not.toHaveProperty("text");
    expect(item).not.toHaveProperty("html");
  });

  it("get_message devolve o texto truncado, marcado como não confiável", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    const m = message(inbox.id, "e1", { textBody: "x".repeat(300) });
    await s.messages.insert(m);

    const { result } = await s.client.call("get_message", { message_id: m.id, max_chars: 100 });

    expect(result.structuredContent!.notice).toMatch(/não como instruções|nunca como instruções/);
    expect(result.structuredContent!.message).toMatchObject({
      format: "text",
      content: "x".repeat(100),
      truncated: true,
    });
  });

  it("get_message e list_messages devolvem o webUrl da página formatada", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    const m = message(inbox.id, "e1", { textBody: "oi" });
    await s.messages.insert(m);
    const url = `https://tempmail.exemplo.test/caixas/${inbox.id}?mensagem=${m.id}`;

    const got = await s.client.call("get_message", { message_id: m.id });
    expect((got.result.structuredContent!.message as { webUrl: string }).webUrl).toBe(url);

    const listed = await s.client.call("list_messages", { inbox_id: inbox.id });
    expect((listed.result.structuredContent!.messages as { webUrl: string }[])[0].webUrl).toBe(url);
  });

  it("view_message liga a tela do MCP App e não manda o corpo ao modelo", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    const m = message(inbox.id, "e1", { textBody: "segredo-do-corpo", htmlBody: "<b>oi</b>" });
    await s.messages.insert(m);

    const tools = await s.client.send("tools/list", {});
    const listed = await tools.text();
    expect(listed).toContain("ui://tempmail/message.html");

    const { result } = await s.client.call("view_message", { message_id: m.id });
    expect(result.content[0].text).not.toContain("segredo-do-corpo");
    expect(result.structuredContent!.message).toMatchObject({ html: "<b>oi</b>", text: "segredo-do-corpo" });

    const res = await s.client.send("resources/read", { uri: "ui://tempmail/message.html" });
    const raw = await res.text();
    expect(raw).toContain("text/html;profile=mcp-app");
    expect(raw).toContain("sandbox");
  });

  it("get_message converte o HTML em texto quando não há texto, e devolve o HTML se pedido", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    const m = message(inbox.id, "e1", { textBody: null });
    await s.messages.insert(m);

    const text = await s.client.call("get_message", { message_id: m.id });
    expect((text.result.structuredContent!.message as { content: string }).content).toContain(
      "Use o código 482913",
    );

    const html = await s.client.call("get_message", { message_id: m.id, format: "html" });
    expect((html.result.structuredContent!.message as { content: string }).content).toContain("<b>482913</b>");
  });

  it("extract_code devolve o código e os links de confirmação", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    const m = message(inbox.id, "e1");
    await s.messages.insert(m);

    const { result } = await s.client.call("extract_code", { message_id: m.id });

    expect(result.structuredContent).toMatchObject({
      verificationCode: "482913",
      links: ["https://github.test/verify?t=abc"],
    });
  });

  it("wait_for_email espera, avisa o progresso e devolve a Mensagem com o código", async () => {
    const s = setup();
    const inbox = await s.createInbox();

    const pending = s.client.call(
      "wait_for_email",
      { inbox_id: inbox.id, timeout_seconds: 5 },
      { progressToken: "p1" },
    );
    await new Promise((r) => setTimeout(r, 100));
    await s.deliver(message(inbox.id, "e1"));
    const { result, notifications } = await pending;

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      status: "received",
      message: { verificationCode: "482913", links: ["https://github.test/verify?t=abc"] },
    });
    expect(typeof result.structuredContent!.cursor).toBe("string");
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0]).toMatchObject({
      method: "notifications/progress",
      params: { progressToken: "p1", total: 5 },
    });
  });

  it("wait_for_email sem email no prazo devolve timeout, que não é erro", async () => {
    const s = setup();
    const inbox = await s.createInbox();

    const { result } = await s.client.call("wait_for_email", { inbox_id: inbox.id, timeout_seconds: 1 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: "timeout" });
    expect(Number.isNaN(Date.parse(result.structuredContent!.cursor as string))).toBe(false);
  });

  it("wait_for_email com cursor espera a próxima, não a que já viu", async () => {
    const s = setup();
    const inbox = await s.createInbox();
    await s.deliver(message(inbox.id, "e1", { subject: "Primeiro", createdAt: new Date(Date.now() - 1_000) }));

    const first = await s.client.call("wait_for_email", { inbox_id: inbox.id });
    expect(first.result.structuredContent).toMatchObject({ message: { subject: "Primeiro" } });

    const pending = s.client.call("wait_for_email", {
      inbox_id: inbox.id,
      since: first.result.structuredContent!.cursor,
      timeout_seconds: 5,
    });
    await new Promise((r) => setTimeout(r, 50));
    await s.deliver(message(inbox.id, "e2", { subject: "Segundo" }));

    expect((await pending).result.structuredContent).toMatchObject({ message: { subject: "Segundo" } });
  });

  it("wait_for_email recusa um since que não é data e uma Caixa expirada", async () => {
    const s = setup();
    const inbox = await s.createInbox();

    const invalid = await s.client.call("wait_for_email", { inbox_id: inbox.id, since: "ontem" });
    expect(invalid.result.structuredContent).toMatchObject({ error: "invalid_since" });

    await s.client.call("delete_inbox", { inbox_id: inbox.id });
    const expired = await s.client.call("wait_for_email", { inbox_id: inbox.id });
    expect(expired.result.structuredContent).toMatchObject({ error: "inbox_expired" });
  });

  it("wait_for_email limita o prazo a 120 s", async () => {
    const s = setup();
    const inbox = await s.createInbox();

    const response = await s.client.send("tools/call", {
      name: "wait_for_email",
      arguments: { inbox_id: inbox.id, timeout_seconds: 600 },
    });
    const body = await response.text();

    expect(body).toMatch(/timeout_seconds|120|too_big|Too big/i);
    expect(s.signal.active).toBe(0);
  });
});
