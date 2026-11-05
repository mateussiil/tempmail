// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationError, TransientError } from "../application/ports";
import { startStubServer } from "../testing/stubServer";
import { createR2Client, S3RawEmailStore } from "./S3RawEmailStore";

/** O SDK acrescenta `?x-id=PutObject`; o que importa é o caminho. */
const pathOf = (url: string) => new URL(url, "http://stub").pathname;

type Stub = Awaited<ReturnType<typeof startStubServer>>;
let stub: Stub;

afterEach(async () => {
  await stub?.close();
});

function store(endpoint: string) {
  const client = createR2Client({
    endpoint,
    accessKeyId: "chave-de-teste",
    secretAccessKey: "segredo-de-teste",
    maxAttempts: 1, // sem as tentativas do SDK, para o teste de erro ser rápido
  });
  return new S3RawEmailStore({ client, bucket: "tempmail" });
}

describe("S3RawEmailStore", () => {
  it("grava o .eml em bucket/chave, assinado, com o tipo message/rfc822", async () => {
    stub = await startStubServer(() => ({ status: 200, headers: { etag: '"abc"' } }));
    const bytes = new TextEncoder().encode("From: a@b.test\r\n\r\ncorpo do email");

    await store(stub.url).put("caixas/inbox-1/msg-1.eml", bytes, "message/rfc822");

    expect(stub.requests).toHaveLength(1);
    const request = stub.requests[0];
    expect(request.method).toBe("PUT");
    expect(pathOf(request.url)).toBe("/tempmail/caixas/inbox-1/msg-1.eml");
    expect(request.headers["content-type"]).toBe("message/rfc822");
    expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=chave-de-teste\//);
    expect(request.body.toString()).toBe("From: a@b.test\r\n\r\ncorpo do email");
    // O R2 não aceita os checksums extras que o SDK novo manda por padrão.
    expect(request.headers["x-amz-checksum-crc32"]).toBeUndefined();
  });

  it("regravar a mesma chave é inofensivo (sobrescreve)", async () => {
    stub = await startStubServer(() => ({ status: 200 }));
    const s = store(stub.url);

    await s.put("caixas/i/m.eml", new Uint8Array([1]), "message/rfc822");
    await s.put("caixas/i/m.eml", new Uint8Array([2]), "message/rfc822");

    expect(stub.requests.map((r) => pathOf(r.url))).toEqual([
      "/tempmail/caixas/i/m.eml",
      "/tempmail/caixas/i/m.eml",
    ]);
  });

  it("credencial recusada (403) é erro de configuração", async () => {
    stub = await startStubServer(() => ({
      status: 403,
      headers: { "content-type": "application/xml" },
      body: "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
    }));

    await expect(store(stub.url).put("k", new Uint8Array([1]), "message/rfc822")).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("erro do R2 (500) é falha passageira", async () => {
    stub = await startStubServer(() => ({
      status: 500,
      headers: { "content-type": "application/xml" },
      body: "<Error><Code>InternalError</Code></Error>",
    }));

    await expect(store(stub.url).put("k", new Uint8Array([1]), "message/rfc822")).rejects.toBeInstanceOf(
      TransientError,
    );
  });

  it("R2 fora do ar é falha passageira", async () => {
    stub = await startStubServer(() => ({ status: 200 }));
    const down = store(stub.url);
    await stub.close();

    await expect(down.put("k", new Uint8Array([1]), "message/rfc822")).rejects.toBeInstanceOf(TransientError);
  });
});
