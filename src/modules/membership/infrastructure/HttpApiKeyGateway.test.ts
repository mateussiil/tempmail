import { describe, expect, it, vi } from "vitest";
import { HttpApiKeyGateway } from "./HttpApiKeyGateway";

describe("HttpApiKeyGateway", () => {
  it("lista, cria e revoga pela rota /api/keys", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ key: { id: "k1" }, token: "tm_x" }, { status: 201 });
      if (init?.method === "DELETE") return Response.json({ revoked: true });
      return Response.json({ keys: [{ id: "k1" }] });
    });
    const g = new HttpApiKeyGateway(fetchFn);

    expect(await g.list()).toEqual({ ok: true, value: [{ id: "k1" }] });
    expect(await g.create("CI")).toEqual({ ok: true, value: { key: { id: "k1" }, token: "tm_x" } });
    expect(await g.revoke("k1")).toEqual({ ok: true, value: { revoked: true } });
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toEqual({ name: "CI" });
    expect(fetchFn.mock.calls[2][0]).toBe("/api/keys/k1");
  });
});
