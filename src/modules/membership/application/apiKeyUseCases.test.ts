import { beforeEach, describe, expect, it } from "vitest";
import { Allowlist } from "../domain/Allowlist";
import { FixedWindowRateLimiter } from "../infrastructure/FixedWindowRateLimiter";
import { FakeApiKeyRepository } from "../testing/FakeApiKeyRepository";
import { CreateApiKeyUseCase, ListApiKeysUseCase, RevokeApiKeyUseCase } from "./ApiKeyUseCases";
import { AuthenticateApiKeyUseCase } from "./AuthenticateApiKeyUseCase";

const t0 = new Date("2026-11-05T12:00:00.000Z");

describe("Chaves de API", () => {
  let repository: FakeApiKeyRepository;
  let now: Date;
  let ids: number;
  let allowed: string;
  let limit: number;

  const create = () =>
    new CreateApiKeyUseCase({ repository, clock: () => now, newId: () => `k${++ids}` });
  const authenticate = () =>
    new AuthenticateApiKeyUseCase({
      repository,
      allowlist: () => Allowlist.fromString(allowed),
      limiter: new FixedWindowRateLimiter(limit),
      clock: () => now,
    });

  beforeEach(() => {
    repository = new FakeApiKeyRepository();
    repository.owners.set("ana", { id: "ana", githubUsername: "ana", name: "Ana", image: null });
    repository.owners.set("bruno", { id: "bruno", githubUsername: "bruno", name: "Bruno", image: null });
    now = t0;
    ids = 0;
    allowed = "ana,bruno";
    limit = 60;
  });

  describe("criar", () => {
    it("devolve o segredo uma vez e guarda só o hash", async () => {
      const result = await create().execute({ memberId: "ana", name: "  meu-script  " });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.token).toMatch(/^tm_/);
      expect(result.value.key).toMatchObject({ id: "k1", name: "meu-script", lastUsedAt: null, revokedAt: null });
      expect(result.value.key.prefix).toBe(result.value.token.slice(0, 11));

      const stored = JSON.stringify([...repository.keys.values()]);
      expect(stored).not.toContain(result.value.token);
      expect(JSON.stringify(result.value.key)).not.toContain(result.value.token.slice(11));
    });

    it("recusa nome vazio ou comprido demais", async () => {
      expect(await create().execute({ memberId: "ana", name: "   " })).toEqual({
        ok: false,
        error: { code: "invalid_name" },
      });
      expect((await create().execute({ memberId: "ana", name: "x".repeat(61) })).ok).toBe(false);
      expect((await create().execute({ memberId: "ana", name: "x".repeat(60) })).ok).toBe(true);
    });
  });

  describe("listar", () => {
    it("mostra só as do Membro, da mais nova para a mais antiga, sem segredo", async () => {
      await create().execute({ memberId: "ana", name: "velha" });
      now = new Date(t0.getTime() + 1000);
      await create().execute({ memberId: "ana", name: "nova" });
      await create().execute({ memberId: "bruno", name: "do-bruno" });

      const listed = await new ListApiKeysUseCase({ repository }).execute({ memberId: "ana" });

      expect(listed.map((key) => key.name)).toEqual(["nova", "velha"]);
      expect(JSON.stringify(listed)).not.toMatch(/key_?hash|"token"/i);
    });
  });

  describe("autenticar", () => {
    async function newToken(memberId = "ana") {
      const result = await create().execute({ memberId, name: "k" });
      if (!result.ok) throw new Error("falha ao criar");
      return result.value;
    }

    it("uma chave criada autentica o Membro e registra o último uso", async () => {
      const { token, key } = await newToken();

      const result = await authenticate().execute(token);

      expect(result).toMatchObject({ status: "member", member: { id: "ana", githubUsername: "ana" } });
      const [listed] = await new ListApiKeysUseCase({ repository }).execute({ memberId: "ana" });
      expect(listed.id).toBe(key.id);
      expect(listed.lastUsedAt).toBe(t0.toISOString());
    });

    it("não grava o último uso a cada pedido, só depois de um minuto", async () => {
      const { token } = await newToken();
      const auth = authenticate();

      await auth.execute(token);
      now = new Date(t0.getTime() + 10_000);
      await auth.execute(token);
      expect(repository.touches).toBe(1);

      now = new Date(t0.getTime() + 61_000);
      await auth.execute(token);
      expect(repository.touches).toBe(2);
    });

    it("recusa chave desconhecida ou mal formada", async () => {
      expect(await authenticate().execute("tm_" + "x".repeat(32))).toEqual({ status: "invalid" });
      expect(await authenticate().execute("qualquer-coisa")).toEqual({ status: "invalid" });
      expect(await authenticate().execute("")).toEqual({ status: "invalid" });
    });

    it("chave revogada deixa de funcionar no pedido seguinte", async () => {
      const { token, key } = await newToken();
      expect((await authenticate().execute(token)).status).toBe("member");

      const revoked = await new RevokeApiKeyUseCase({ repository, clock: () => now }).execute({
        memberId: "ana",
        keyId: key.id,
      });

      expect(revoked.ok).toBe(true);
      expect(await authenticate().execute(token)).toEqual({ status: "invalid" });
    });

    it("a chave de um Membro removido da lista é recusada, e volta se ele voltar", async () => {
      const { token } = await newToken();
      allowed = "bruno";

      expect(await authenticate().execute(token)).toEqual({ status: "revoked" });

      allowed = "ana,bruno";
      expect((await authenticate().execute(token)).status).toBe("member");
    });

    it("lista vazia não autoriza ninguém (falha fechada)", async () => {
      const { token } = await newToken();
      allowed = "";

      expect(await authenticate().execute(token)).toEqual({ status: "revoked" });
    });

    it("o 61º pedido no minuto recebe limite, e o limite é por chave", async () => {
      const first = await newToken("ana");
      const second = await newToken("bruno");
      const auth = authenticate();

      for (let i = 0; i < 60; i++) expect((await auth.execute(first.token)).status).toBe("member");

      expect(await auth.execute(first.token)).toEqual({ status: "rate_limited", retryAfterSeconds: 60 });
      expect((await auth.execute(second.token)).status).toBe("member");
    });

    it("pedido recusado por limite não consome o limite de outro minuto", async () => {
      limit = 1;
      const { token } = await newToken();
      const auth = authenticate();
      await auth.execute(token);

      expect((await auth.execute(token)).status).toBe("rate_limited");
      now = new Date(t0.getTime() + 60_000);
      expect((await auth.execute(token)).status).toBe("member");
    });
  });

  describe("revogar", () => {
    it("só o dono revoga; a chave de outro Membro dá não encontrada", async () => {
      const created = await create().execute({ memberId: "ana", name: "k" });
      if (!created.ok) throw new Error("falha ao criar");
      const revoke = new RevokeApiKeyUseCase({ repository, clock: () => now });

      expect(await revoke.execute({ memberId: "bruno", keyId: created.value.key.id })).toEqual({
        ok: false,
        error: { code: "not_found" },
      });
      expect((await authenticate().execute(created.value.token)).status).toBe("member");
    });

    it("repetir a revogação não faz mal e uma chave inexistente dá não encontrada", async () => {
      const created = await create().execute({ memberId: "ana", name: "k" });
      if (!created.ok) throw new Error("falha ao criar");
      const revoke = new RevokeApiKeyUseCase({ repository, clock: () => now });

      expect((await revoke.execute({ memberId: "ana", keyId: created.value.key.id })).ok).toBe(true);
      expect((await revoke.execute({ memberId: "ana", keyId: created.value.key.id })).ok).toBe(true);
      expect((await revoke.execute({ memberId: "ana", keyId: "nao-existe" })).ok).toBe(false);
    });
  });
});
