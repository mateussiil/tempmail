import {
  TransientError,
  type RawDownload,
  type RawEmailDownloader,
} from "../application/ports";

type Options = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Só para testes: aceita `http://`. */
  allowInsecure?: boolean;
};

/** Baixa o `.eml` pelo link assinado do Resend, sem nunca ler mais que o limite. */
export class HttpRawEmailDownloader implements RawEmailDownloader {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: Options = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async download(url: string, maxBytes: number): Promise<RawDownload> {
    const parsed = this.parse(url);

    let response: Response;
    try {
      response = await this.fetchFn(parsed, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new TransientError(`Falha de rede ao baixar o .eml: ${String(error)}`);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new TransientError(`O download do .eml respondeu ${response.status}`);
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }

    return this.readWithLimit(response, maxBytes);
  }

  private parse(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new TransientError("O link do .eml não é uma URL válida");
    }
    if (parsed.protocol !== "https:" && !(this.options.allowInsecure && parsed.protocol === "http:")) {
      throw new TransientError(`O link do .eml usa um protocolo recusado: ${parsed.protocol}`);
    }
    return parsed;
  }

  private async readWithLimit(response: Response, maxBytes: number): Promise<RawDownload> {
    if (!response.body) return { ok: true, bytes: new Uint8Array(0) };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: "too_large" };
        }
        chunks.push(value);
      }
    } catch (error) {
      throw new TransientError(`Falha ao ler o .eml: ${String(error)}`);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, bytes };
  }
}
