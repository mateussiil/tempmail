// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ConfigurationError, TransientError } from "../application/ports";
import { ResendReceivedEmailSource } from "./ResendReceivedEmailSource";

const apiResponse = {
  object: "email",
  id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
  to: ["teste@tmp.mateussiil.com.br"],
  from: "noreply@github.com",
  created_at: "2026-11-05T12:00:00.000Z",
  subject: "Seu código de verificação",
  html: "<p>Use o código <b>482913</b></p>",
  html_format: "data_uri",
  text: "Use o código 482913",
  headers: { From: "GitHub <noreply@github.com>", "mime-version": "1.0" },
  received_for: ["teste@tmp.mateussiil.com.br"],
  message_id: "<111-222@mail.github.com>",
  raw: {
    download_url: "https://example.resend.com/receiving/raw/abc?Signature=xyz",
    expires_at: "2026-11-05T13:00:00.000Z",
  },
  attachments: [
    {
      id: "att-1",
      filename: "nota.pdf",
      content_type: "application/pdf",
      content_disposition: null,
      content_id: null,
      size: 13264,
    },
  ],
};

function source(respond: () => Response | Promise<Response>, extra: { debug?: (l: string, d: Record<string, unknown>) => void } = {}) {
  const fetchFn = vi.fn(async () => respond()) as unknown as typeof fetch;
  return {
    fetchFn,
    source: new ResendReceivedEmailSource({ apiKey: "re_chave", baseUrl: "https://api.resend.test/", fetchFn, ...extra }),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ResendReceivedEmailSource", () => {
  it("busca o email com a chave e interpreta a resposta", async () => {
    const s = source(() => json(apiResponse));

    const result = await s.source.fetch("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");

    expect(result).toEqual({
      ok: true,
      value: {
        id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
        from: "noreply@github.com",
        fromHeader: "GitHub <noreply@github.com>",
        subject: "Seu código de verificação",
        html: "<p>Use o código <b>482913</b></p>",
        text: "Use o código 482913",
        messageId: "<111-222@mail.github.com>",
        rawDownloadUrl: "https://example.resend.com/receiving/raw/abc?Signature=xyz",
        attachments: [
          {
            id: "att-1",
            filename: "nota.pdf",
            contentType: "application/pdf",
            contentDisposition: null,
            contentId: null,
            size: 13264,
          },
        ],
        receivedAt: new Date("2026-11-05T12:00:00.000Z"),
      },
    });

    const [url, init] = (s.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.test/emails/receiving/4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_chave");
  });

  it("codifica o id na URL", async () => {
    const s = source(() => json(apiResponse));

    await s.source.fetch("a/b?c");

    const [url] = (s.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url.endsWith("/emails/receiving/a%2Fb%3Fc")).toBe(true);
  });

  it("tira o nome do remetente quando `from` vem no formato com nome", async () => {
    const s = source(() => json({ ...apiResponse, from: "GitHub <NoReply@GitHub.com>", headers: {} }));

    const result = await s.source.fetch("e1");

    expect(result.ok && result.value.from).toBe("noreply@github.com");
    expect(result.ok && result.value.fromHeader).toBe("GitHub <NoReply@GitHub.com>");
  });

  it("aceita texto, html e anexos ausentes", async () => {
    const s = source(() =>
      json({ id: "e1", from: "a@b.test", subject: null, html: null, text: null, attachments: null, raw: null }),
    );

    const result = await s.source.fetch("e1");

    expect(result.ok && result.value).toMatchObject({
      subject: "",
      html: null,
      text: null,
      attachments: [],
      rawDownloadUrl: null,
      fromHeader: null,
    });
  });

  it("cota estourada (403 email_above_quota) vira quota_exceeded", async () => {
    const s = source(() => json({ statusCode: 403, name: "email_above_quota", message: "acima da cota" }, 403));

    expect(await s.source.fetch("e1")).toEqual({ ok: false, error: { code: "quota_exceeded" } });
  });

  it("email desconhecido (404, 400 ou 422) vira not_found", async () => {
    for (const status of [404, 400, 422]) {
      const s = source(() => json({ name: "not_found" }, status));

      expect(await s.source.fetch("e1")).toEqual({ ok: false, error: { code: "not_found" } });
    }
  });

  it("chave recusada (401) ou sem permissão (403 de outro tipo) é erro de configuração", async () => {
    for (const [status, name] of [
      [401, "restricted_api_key"],
      [401, "missing_api_key"],
      [403, "invalid_permission"],
      [403, "suspended_api_key"],
    ] as const) {
      const s = source(() => json({ name }, status));

      const error = await s.source.fetch("e1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain(name);
    }
  });

  it("limite de requisições (429) e erros 5xx são falhas passageiras", async () => {
    for (const status of [429, 500, 502, 503]) {
      const s = source(() => json({ name: "rate_limit_exceeded" }, status));

      await expect(s.source.fetch("e1")).rejects.toBeInstanceOf(TransientError);
    }
  });

  it("erro de rede e resposta que não é JSON são falhas passageiras", async () => {
    const network = source(() => {
      throw new TypeError("fetch failed");
    });
    const notJson = source(() => new Response("<html>bad gateway</html>", { status: 200 }));
    const incomplete = source(() => json({ object: "email" }));

    await expect(network.source.fetch("e1")).rejects.toBeInstanceOf(TransientError);
    await expect(notJson.source.fetch("e1")).rejects.toBeInstanceOf(TransientError);
    await expect(incomplete.source.fetch("e1")).rejects.toBeInstanceOf(TransientError);
  });

  it("entrega a resposta crua ao debug, quando ligado", async () => {
    const seen: [string, Record<string, unknown>][] = [];
    const s = source(() => json(apiResponse), { debug: (label, data) => seen.push([label, data]) });

    await s.source.fetch("e1");

    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe("resend.api.response");
    expect(seen[0][1]).toMatchObject({ emailId: "e1", status: 200 });
    expect(String(seen[0][1].body)).toContain("482913");
  });
});
