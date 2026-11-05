import { describe, expect, it, vi } from "vitest";
import { endedSession, requestJson } from "./apiClient";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("requestJson", () => {
  it("devolve o corpo quando dá certo, mandando JSON e a sessão", async () => {
    const fetchFn = vi.fn(async () => json(200, { a: 1 }));

    const result = await requestJson(fetchFn, "/api/x", { method: "POST", body: "{}" });

    expect(result).toEqual({ ok: true, value: { a: 1 } });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.credentials).toBe("same-origin");
  });

  it("traduz o erro da rota, guardando os campos extras", async () => {
    const result = await requestJson(async () => json(409, { error: "limit_reached", message: "Limite.", max: 20 }), "/api/x");

    expect(result).toEqual({
      ok: false,
      error: { status: 409, code: "limit_reached", message: "Limite.", details: { max: 20 } },
    });
  });

  it("erro sem corpo JSON vira http_<status>", async () => {
    const result = await requestJson(async () => new Response("quebrou", { status: 502 }), "/api/x");

    expect(result.ok === false && result.error.code).toBe("http_502");
  });

  it("falha de rede não lança: vira o erro network", async () => {
    const result = await requestJson(async () => {
      throw new TypeError("Failed to fetch");
    }, "/api/x");

    expect(result.ok === false && result.error.code).toBe("network");
  });
});

describe("endedSession", () => {
  const error = (status: number, code: string) => ({ status, code, message: "", details: {} });

  it("401 é sessão acabada e 403 access_ended é acesso encerrado", () => {
    expect(endedSession(error(401, "unauthenticated"))).toBe("anonymous");
    expect(endedSession(error(403, "access_ended"))).toBe("revoked");
    expect(endedSession(error(404, "not_found"))).toBeNull();
  });
});
