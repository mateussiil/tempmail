import { describe, expect, it, vi } from "vitest";
import { HttpMessageGateway } from "./HttpMessageGateway";

describe("HttpMessageGateway", () => {
  it("lista, lê e busca os cabeçalhos pelas rotas certas", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/messages")) return Response.json({ messages: [{ id: "m1" }] });
      if (url.endsWith("/headers")) return Response.json({ headers: [{ name: "From", value: "a" }] });
      return Response.json({ message: { id: "m1" } });
    });
    const g = new HttpMessageGateway(fetchFn);

    expect(await g.list("i1")).toEqual({ ok: true, value: [{ id: "m1" }] });
    expect(await g.get("m1")).toEqual({ ok: true, value: { id: "m1" } });
    expect(await g.headers("m1")).toEqual({ ok: true, value: [{ name: "From", value: "a" }] });
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      "/api/inboxes/i1/messages",
      "/api/messages/m1",
      "/api/messages/m1/headers",
    ]);
  });

  it("monta os links de download", () => {
    const g = new HttpMessageGateway(vi.fn());

    expect(g.rawUrl("m1")).toBe("/api/messages/m1/raw");
    expect(g.attachmentUrl("m1", 2)).toBe("/api/messages/m1/attachments/2");
  });
});
