// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { InboxError } from "@/modules/inbox/application/InboxError";
import { inboxErrorResponse, readJsonObject } from "./http";

function post(body: string | undefined, contentType?: string): Request {
  return new Request("http://localhost/api/inboxes", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });
}

describe("inboxErrorResponse", () => {
  it("mapeia cada erro de negócio para o status HTTP certo", async () => {
    const cases: [InboxError, number][] = [
      [{ code: "invalid_address", problem: "length" }, 400],
      [{ code: "address_taken" }, 409],
      [{ code: "already_active" }, 409],
      [{ code: "limit_reached", max: 20 }, 409],
      [{ code: "not_found" }, 404],
      [{ code: "not_active" }, 409],
      [{ code: "not_expired" }, 409],
    ];

    for (const [error, status] of cases) {
      const response = inboxErrorResponse(error);
      expect(response.status).toBe(status);
      expect((await response.json()).error).toBe(error.code);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("informa o limite e o problema do nome quando for o caso", async () => {
    const limit = await inboxErrorResponse({ code: "limit_reached", max: 20 }).json();
    const invalid = await inboxErrorResponse({ code: "invalid_address", problem: "characters" }).json();

    expect(limit).toMatchObject({ max: 20 });
    expect(limit.message).toContain("20 Caixas ativas");
    expect(invalid).toMatchObject({ problem: "characters" });
  });
});

describe("readJsonObject", () => {
  it("aceita corpo vazio quando permitido", async () => {
    expect(await readJsonObject(post(undefined), { allowEmpty: true })).toEqual({ ok: true, body: {} });
    expect(await readJsonObject(post("  "), { allowEmpty: true })).toEqual({ ok: true, body: {} });
  });

  it("recusa corpo vazio quando é obrigatório", async () => {
    const result = await readJsonObject(post(undefined), { allowEmpty: false });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("lê um objeto JSON", async () => {
    const result = await readJsonObject(post('{"address":"teste"}', "application/json"), {
      allowEmpty: true,
    });

    expect(result).toEqual({ ok: true, body: { address: "teste" } });
  });

  it("aceita o content-type com charset", async () => {
    const result = await readJsonObject(post("{}", "application/json; charset=utf-8"), {
      allowEmpty: true,
    });

    expect(result.ok).toBe(true);
  });

  it("recusa corpo que não é application/json com 415", async () => {
    for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded"]) {
      const result = await readJsonObject(post('{"a":1}', type), { allowEmpty: true });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(415);
    }
  });

  it("recusa JSON inválido, array e valores que não são objeto com 400", async () => {
    for (const body of ["{ruim", "[1,2]", "42", '"texto"', "null"]) {
      const result = await readJsonObject(post(body, "application/json"), { allowEmpty: true });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(400);
    }
  });
});
