// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { TransientError } from "../application/ports";
import { HttpRawEmailDownloader } from "./HttpRawEmailDownloader";

const URL_OK = "https://example.resend.com/receiving/raw/abc?Signature=xyz";

function downloader(respond: () => Response | Promise<Response>, options: { allowInsecure?: boolean } = {}) {
  const fetchFn = vi.fn(async () => respond()) as unknown as typeof fetch;
  return { fetchFn, downloader: new HttpRawEmailDownloader({ fetchFn, ...options }) };
}

function streamOf(chunkSizes: number[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunkSizes.length) return controller.close();
      controller.enqueue(new Uint8Array(chunkSizes[index++]).fill(65));
    },
  });
}

describe("HttpRawEmailDownloader", () => {
  it("baixa o .eml inteiro quando cabe no limite", async () => {
    const d = downloader(() => new Response("From: a@b.test\r\n\r\ncorpo"));

    const result = await d.downloader.download(URL_OK, 1024);

    expect(result.ok).toBe(true);
    expect(result.ok && new TextDecoder().decode(result.bytes)).toBe("From: a@b.test\r\n\r\ncorpo");
  });

  it("aceita um corpo vazio", async () => {
    const d = downloader(() => new Response(null, { status: 200 }));

    const result = await d.downloader.download(URL_OK, 1024);

    expect(result.ok && result.bytes.byteLength).toBe(0);
  });

  it("recusa pelo Content-Length, sem ler o corpo", async () => {
    const body = streamOf([10]);
    const d = downloader(() => new Response(body, { headers: { "content-length": "5000" } }));

    const result = await d.downloader.download(URL_OK, 1000);

    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("sem Content-Length, para de ler quando passa do limite", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(400).fill(65));
        if (pulled > 50) controller.close();
      },
    });
    const d = downloader(() => new Response(body));

    const result = await d.downloader.download(URL_OK, 1000);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(pulled).toBeLessThan(10); // não leu o arquivo todo
  });

  it("aceita exatamente o tamanho do limite", async () => {
    const d = downloader(() => new Response(streamOf([500, 500])));

    const result = await d.downloader.download(URL_OK, 1000);

    expect(result.ok && result.bytes.byteLength).toBe(1000);
  });

  it("junta os pedaços na ordem", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("abc"));
        controller.enqueue(encoder.encode("def"));
        controller.close();
      },
    });
    const d = downloader(() => new Response(body));

    const result = await d.downloader.download(URL_OK, 1000);

    expect(result.ok && new TextDecoder().decode(result.bytes)).toBe("abcdef");
  });

  it("resposta de erro e falha de rede são falhas passageiras", async () => {
    const error = downloader(() => new Response("negado", { status: 403 }));
    const network = downloader(() => {
      throw new TypeError("fetch failed");
    });

    await expect(error.downloader.download(URL_OK, 1000)).rejects.toBeInstanceOf(TransientError);
    await expect(network.downloader.download(URL_OK, 1000)).rejects.toBeInstanceOf(TransientError);
  });

  it("recusa link inválido e protocolo que não seja https", async () => {
    const d = downloader(() => new Response("x"));

    await expect(d.downloader.download("não é url", 1000)).rejects.toBeInstanceOf(TransientError);
    await expect(d.downloader.download("http://example.com/raw", 1000)).rejects.toBeInstanceOf(TransientError);
    await expect(d.downloader.download("file:///etc/passwd", 1000)).rejects.toBeInstanceOf(TransientError);
    expect(d.fetchFn).not.toHaveBeenCalled();
  });

  it("só aceita http quando liberado (testes)", async () => {
    const d = downloader(() => new Response("ok"), { allowInsecure: true });

    const result = await d.downloader.download("http://127.0.0.1:9/raw", 1000);

    expect(result.ok).toBe(true);
    await expect(d.downloader.download("file:///etc/passwd", 1000)).rejects.toBeInstanceOf(TransientError);
  });
});
