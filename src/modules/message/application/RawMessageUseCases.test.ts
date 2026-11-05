import { describe, expect, it } from "vitest";
import { Message, type AttachmentMeta } from "../domain/Message";
import { FakeEmailParser, FakeInboxDirectory, FakeMessageRepository, FakeRawEmailReader } from "../testing/fakes";
import {
  emlFilename,
  GetAttachmentUseCase,
  GetMessageHeadersUseCase,
  GetRawMessageUseCase,
  pickAttachment,
} from "./RawMessageUseCases";

const meta = (filename: string | null, size: number | null = null): AttachmentMeta => ({
  id: `att-${filename}`,
  filename,
  contentType: "application/pdf",
  contentDisposition: "attachment",
  contentId: null,
  size,
});

const parsed = (filename: string | null, text = filename ?? "x") => ({
  filename,
  contentType: "application/pdf",
  size: text.length,
  content: new TextEncoder().encode(text),
});

function setup() {
  const repository = new FakeMessageRepository();
  const reader = new FakeRawEmailReader();
  const parser = new FakeEmailParser();
  const directory = new FakeInboxDirectory([
    { id: "inbox-ana", address: "da-ana", active: true, ownerId: "ana" },
    { id: "inbox-velha", address: "velha", active: false, ownerId: "ana" },
  ]);
  const deps = { directory, repository, reader, parser };

  const store = async (inboxId: string, emailId: string, options: { raw?: boolean; attachments?: AttachmentMeta[] } = {}) => {
    const id = Message.idFor(emailId, inboxId);
    const rawKey = options.raw === false ? null : Message.rawKeyFor(inboxId, id);
    const message = Message.ready({
      inboxId,
      emailId,
      messageId: null,
      fromAddress: "a@b.test",
      fromHeader: null,
      subject: "Pedido nº 1042: confirmado!",
      textBody: "oi",
      htmlBody: null,
      rawKey,
      rawSize: 10,
      attachments: options.attachments ?? [],
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    await repository.insert(message);
    if (rawKey) reader.objects.set(rawKey, new TextEncoder().encode("From: a@b.test\r\n\r\noi"));
    return message;
  };

  return {
    store,
    parser,
    reader,
    raw: new GetRawMessageUseCase(deps),
    headers: new GetMessageHeadersUseCase(deps),
    attachment: new GetAttachmentUseCase(deps),
  };
}

describe("GetRawMessageUseCase", () => {
  it("devolve o .eml com um nome de arquivo tirado do assunto", async () => {
    const s = setup();
    const m = await s.store("inbox-ana", "e1");

    const result = await s.raw.execute({ ownerId: "ana", messageId: m.id });

    expect(result.ok && result.value.filename).toBe("Pedido-n-1042-confirmado.eml");
    expect(result.ok && new TextDecoder().decode(result.value.bytes)).toContain("From: a@b.test");
  });

  it("outro Membro, Mensagem inexistente e Caixa expirada respondem not_found", async () => {
    const s = setup();
    const m = await s.store("inbox-ana", "e1");
    const old = await s.store("inbox-velha", "e2");

    expect(await s.raw.execute({ ownerId: "bruno", messageId: m.id })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await s.raw.execute({ ownerId: "ana", messageId: "nada" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await s.raw.execute({ ownerId: "ana", messageId: old.id })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("sem .eml guardado (cota ou tamanho) ou sumido do R2 responde no_raw", async () => {
    const s = setup();
    const withoutRaw = await s.store("inbox-ana", "e1", { raw: false });
    const gone = await s.store("inbox-ana", "e2");
    s.reader.objects.clear();

    expect(await s.raw.execute({ ownerId: "ana", messageId: withoutRaw.id })).toEqual({ ok: false, error: { code: "no_raw" } });
    expect(await s.raw.execute({ ownerId: "ana", messageId: gone.id })).toEqual({ ok: false, error: { code: "no_raw" } });
  });
});

describe("GetMessageHeadersUseCase", () => {
  it("devolve os cabeçalhos do .eml", async () => {
    const s = setup();
    const m = await s.store("inbox-ana", "e1");
    s.parser.headers = [{ name: "From", value: "a@b.test" }];

    expect(await s.headers.execute({ ownerId: "ana", messageId: m.id })).toEqual({
      ok: true,
      value: [{ name: "From", value: "a@b.test" }],
    });
  });
});

describe("GetAttachmentUseCase", () => {
  it("extrai o anexo da posição pedida, casando pelo nome", async () => {
    const s = setup();
    const m = await s.store("inbox-ana", "e1", { attachments: [meta("a.pdf"), meta("b.pdf")] });
    s.parser.attachments = [parsed("b.pdf", "conteúdo b"), parsed("a.pdf", "conteúdo a")];

    const result = await s.attachment.execute({ ownerId: "ana", messageId: m.id, index: 1 });

    expect(result.ok && result.value.filename).toBe("b.pdf");
    expect(result.ok && new TextDecoder().decode(result.value.bytes)).toBe("conteúdo b");
  });

  it("posição fora da lista responde attachment_not_found", async () => {
    const s = setup();
    const m = await s.store("inbox-ana", "e1", { attachments: [meta("a.pdf")] });
    s.parser.attachments = [parsed("a.pdf")];

    expect(await s.attachment.execute({ ownerId: "ana", messageId: m.id, index: 5 })).toEqual({
      ok: false,
      error: { code: "attachment_not_found" },
    });
  });
});

describe("pickAttachment", () => {
  it("com nomes repetidos, desempata pelo tamanho", () => {
    const found = pickAttachment([meta("x.pdf", 3)], [parsed("x.pdf", "12345"), parsed("x.pdf", "123")], 0);
    expect(found?.size).toBe(3);
  });

  it("sem nome que bata, usa a mesma posição", () => {
    const found = pickAttachment([meta(null), meta(null)], [parsed(null, "um"), parsed(null, "dois")], 1);
    expect(new TextDecoder().decode(found!.content)).toBe("dois");
  });
});

describe("emlFilename", () => {
  it("assunto vazio vira mensagem.eml", () => {
    expect(emlFilename("")).toBe("mensagem.eml");
    expect(emlFilename("!!!")).toBe("mensagem.eml");
  });
});
