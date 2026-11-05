import { describe, expect, it, vi } from "vitest";
import { HttpInboxGateway } from "./HttpInboxGateway";

const inbox = { id: "i1", address: "a", fullAddress: "a@x", status: "active", kept: false, expiresAt: null, createdAt: "" };

function gateway(status: number, body: unknown) {
  const fetchFn = vi.fn(async () => Response.json(body, { status }));
  return { fetchFn, gateway: new HttpInboxGateway(fetchFn) };
}

const call = (fetchFn: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = fetchFn.mock.calls[i] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe("HttpInboxGateway", () => {
  it("lista pela rota /api/inboxes", async () => {
    const { fetchFn, gateway: g } = gateway(200, { inboxes: [inbox] });

    expect(await g.list()).toEqual({ ok: true, value: [inbox] });
    expect(call(fetchFn)).toMatchObject({ url: "/api/inboxes", method: "GET" });
  });

  it("cria aleatória sem address e escolhida com address", async () => {
    const { fetchFn, gateway: g } = gateway(201, { inbox, reactivated: false });

    await g.create({});
    await g.create({ address: "meu-nome" });

    expect(call(fetchFn, 0)).toMatchObject({ method: "POST", body: {} });
    expect(call(fetchFn, 1)).toMatchObject({ method: "POST", body: { address: "meu-nome" } });
  });

  it("mantém, apaga e reativa pela Caixa certa", async () => {
    const { fetchFn, gateway: g } = gateway(200, { inbox });

    expect(await g.setKept("i/1", true)).toEqual({ ok: true, value: inbox });
    await g.remove("i1");
    await g.reactivate("i1", true);

    expect(call(fetchFn, 0)).toMatchObject({ url: "/api/inboxes/i%2F1", method: "PATCH", body: { kept: true } });
    expect(call(fetchFn, 1)).toMatchObject({ url: "/api/inboxes/i1", method: "DELETE" });
    expect(call(fetchFn, 2)).toMatchObject({ url: "/api/inboxes/i1/reactivate", method: "POST", body: { keep: true } });
  });

  it("consulta a disponibilidade com o endereço na query", async () => {
    const { fetchFn, gateway: g } = gateway(200, { availability: "free" });

    expect(await g.checkAvailability("a b")).toEqual({ ok: true, value: { availability: "free" } });
    expect(call(fetchFn).url).toBe("/api/inboxes/availability?address=a%20b");
  });

  it("repassa o erro da rota", async () => {
    const { gateway: g } = gateway(409, { error: "address_taken", message: "É de outro." });

    expect(await g.create({ address: "x" })).toMatchObject({ ok: false, error: { code: "address_taken" } });
  });
});
