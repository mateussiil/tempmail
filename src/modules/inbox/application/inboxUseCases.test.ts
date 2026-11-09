import { describe, expect, it } from "vitest";
import { Inbox } from "../domain/Inbox";
import { FakeInboxRepository } from "../testing/FakeInboxRepository";
import { makeInboxDeps } from "../testing/inboxTestDeps";
import { CheckAddressUseCase } from "./CheckAddressUseCase";
import { CreateInboxUseCase } from "./CreateInboxUseCase";
import { DeleteInboxUseCase } from "./DeleteInboxUseCase";
import { describeInboxError } from "./InboxError";
import { InboxAddressConflictError } from "./InboxRepository";
import { ListInboxesUseCase } from "./ListInboxesUseCase";
import { ReactivateInboxUseCase } from "./ReactivateInboxUseCase";
import { SetInboxKeptUseCase } from "./SetInboxKeptUseCase";

const ANA = "ana";
const BRUNO = "bruno";

function setup(options: { max?: number; repository?: FakeInboxRepository } = {}) {
  const ctx = makeInboxDeps(options);
  return {
    ...ctx,
    create: new CreateInboxUseCase(ctx.deps),
    list: new ListInboxesUseCase(ctx.deps),
    setKept: new SetInboxKeptUseCase(ctx.deps),
    remove: new DeleteInboxUseCase(ctx.deps),
    reactivate: new ReactivateInboxUseCase(ctx.deps),
    check: new CheckAddressUseCase(ctx.deps),
  };
}

/** Cria e devolve a Caixa, falhando o teste se a criação der erro. */
async function created(
  s: ReturnType<typeof setup>,
  ownerId: string,
  address?: string,
): Promise<{ id: string; address: string }> {
  const result = await s.create.execute({ ownerId, address });
  if (!result.ok) throw new Error(`criação falhou: ${result.error.code}`);
  return result.value.inbox;
}

describe("CreateInboxUseCase", () => {
  it("cria uma Caixa com o nome escolhido, ativa e com prazo de 24 h", async () => {
    const s = setup();

    const result = await s.create.execute({ ownerId: ANA, address: "stripe-teste" });

    expect(result).toEqual({
      ok: true,
      value: {
        reactivated: false,
        inbox: {
          id: "id-1",
          address: "stripe-teste",
          fullAddress: "stripe-teste@tmp.exemplo.test",
          status: "active",
          kept: false,
          expiresAt: "2026-11-06T12:00:00.000Z",
          createdAt: "2026-11-05T12:00:00.000Z",
          mascot: "corvo",
        },
      },
    });
  });

  it("normaliza o nome escolhido", async () => {
    const s = setup();

    const inbox = await created(s, ANA, "  Stripe-Teste ");

    expect(inbox.address).toBe("stripe-teste");
  });

  it("gera um endereço aleatório quando nenhum nome é dado", async () => {
    const s = setup();

    const inbox = await created(s, ANA);

    expect(inbox.address).toBe("aleatoria1");
  });

  it("pula um endereço aleatório que já existe", async () => {
    const s = setup();
    await created(s, BRUNO, "aleatoria1"); // colide com o primeiro sorteio

    const inbox = await created(s, ANA);

    expect(inbox.address).toBe("aleatoria2");
  });

  it("recusa nome inválido, dizendo o problema", async () => {
    const s = setup();

    expect(await s.create.execute({ ownerId: ANA, address: "ab" })).toEqual({
      ok: false,
      error: { code: "invalid_address", problem: "length" },
    });
    expect(await s.create.execute({ ownerId: ANA, address: "com espaço" })).toEqual({
      ok: false,
      error: { code: "invalid_address", problem: "characters" },
    });
  });

  it("recusa o endereço de outro Membro, mesmo expirado", async () => {
    const s = setup();
    const bruno = await created(s, BRUNO, "stripe-teste");
    await s.remove.execute({ ownerId: BRUNO, inboxId: bruno.id });

    const result = await s.create.execute({ ownerId: ANA, address: "stripe-teste" });

    expect(result).toEqual({ ok: false, error: { code: "address_taken" } });
  });

  it("recusa criar um endereço seu que já está ativo", async () => {
    const s = setup();
    await created(s, ANA, "teste-pix");

    const result = await s.create.execute({ ownerId: ANA, address: "teste-pix" });

    expect(result).toEqual({ ok: false, error: { code: "already_active" } });
  });

  it("criar um endereço seu expirado reativa a mesma Caixa, vazia e com novo prazo", async () => {
    const s = setup();
    const first = await created(s, ANA, "stripe-teste");
    await s.remove.execute({ ownerId: ANA, inboxId: first.id });
    s.advanceHours(48);

    const result = await s.create.execute({ ownerId: ANA, address: "stripe-teste" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reactivated).toBe(true);
      expect(result.value.inbox.id).toBe(first.id);
      expect(result.value.inbox.status).toBe("active");
      expect(result.value.inbox.expiresAt).toBe("2026-11-08T12:00:00.000Z");
    }
  });

  it("um Membro não vê o endereço do outro como seu, nem com maiúsculas", async () => {
    const s = setup();
    await created(s, BRUNO, "qa-login");

    const result = await s.create.execute({ ownerId: ANA, address: "QA-Login" });

    expect(result).toEqual({ ok: false, error: { code: "address_taken" } });
  });

  describe("limite de Caixas ativas", () => {
    it("recusa a Caixa além do limite, nomeada ou aleatória, informando o máximo", async () => {
      const s = setup({ max: 2 });
      await created(s, ANA);
      await created(s, ANA);

      expect(await s.create.execute({ ownerId: ANA, address: "terceira" })).toEqual({
        ok: false,
        error: { code: "limit_reached", max: 2 },
      });
      expect(await s.create.execute({ ownerId: ANA })).toEqual({
        ok: false,
        error: { code: "limit_reached", max: 2 },
      });
    });

    it("conta as Caixas mantidas", async () => {
      const s = setup({ max: 1 });
      const mine = await created(s, ANA);
      await s.setKept.execute({ ownerId: ANA, inboxId: mine.id, kept: true });
      s.advanceHours(24 * 30);

      const result = await s.create.execute({ ownerId: ANA });

      expect(result).toEqual({ ok: false, error: { code: "limit_reached", max: 1 } });
    });

    it("não conta Caixas expiradas nem as de outros Membros", async () => {
      const s = setup({ max: 1 });
      await created(s, BRUNO);
      const old = await created(s, ANA);
      await s.remove.execute({ ownerId: ANA, inboxId: old.id });

      const result = await s.create.execute({ ownerId: ANA });

      expect(result.ok).toBe(true);
    });

    it("apagar uma Caixa libera uma vaga", async () => {
      const s = setup({ max: 1 });
      const first = await created(s, ANA);
      expect((await s.create.execute({ ownerId: ANA })).ok).toBe(false);

      await s.remove.execute({ ownerId: ANA, inboxId: first.id });

      expect((await s.create.execute({ ownerId: ANA })).ok).toBe(true);
    });

    it("a Caixa que expirou pelo prazo também libera a vaga", async () => {
      const s = setup({ max: 1 });
      await created(s, ANA);
      s.advanceHours(25);

      expect((await s.create.execute({ ownerId: ANA })).ok).toBe(true);
    });

    it("reativar pelo nome também respeita o limite", async () => {
      const s = setup({ max: 1 });
      const first = await created(s, ANA, "antiga");
      await s.remove.execute({ ownerId: ANA, inboxId: first.id });
      await created(s, ANA, "nova"); // ocupa a única vaga

      const result = await s.create.execute({ ownerId: ANA, address: "antiga" });

      expect(result).toEqual({ ok: false, error: { code: "limit_reached", max: 1 } });
    });
  });

  describe("corrida entre dois pedidos pelo mesmo endereço", () => {
    // O banco recusa o segundo insert; o caso de uso decide pelo vencedor.
    class RacyRepository extends FakeInboxRepository {
      constructor(private readonly winner: () => Inbox) {
        super();
      }
      private raced = false;
      async insert(inbox: Inbox): Promise<void> {
        if (!this.raced) {
          this.raced = true;
          this.seed(this.winner());
          throw new InboxAddressConflictError(inbox.address);
        }
        return super.insert(inbox);
      }
    }

    const winnerFor = (ownerId: string) => () =>
      Inbox.open({
        id: "vencedora",
        address: "disputada",
        ownerId,
        now: new Date("2026-11-05T12:00:00Z"),
        policy: setup().deps.policy,
        mascot: "baleia",
      });

    it("perde para outro Membro: address_taken", async () => {
      const s = setup({ repository: new RacyRepository(winnerFor(BRUNO)) });

      const result = await s.create.execute({ ownerId: ANA, address: "disputada" });

      expect(result).toEqual({ ok: false, error: { code: "address_taken" } });
    });

    it("perde para si mesmo (dois pedidos do mesmo Membro): already_active", async () => {
      const s = setup({ repository: new RacyRepository(winnerFor(ANA)) });

      const result = await s.create.execute({ ownerId: ANA, address: "disputada" });

      expect(result).toEqual({ ok: false, error: { code: "already_active" } });
    });
  });
});

describe("ListInboxesUseCase", () => {
  it("lista só as Caixas do Membro, ativas antes das expiradas, mais novas antes", async () => {
    const s = setup();
    const velha = await created(s, ANA, "velha");
    s.advanceHours(1);
    await created(s, BRUNO, "do-bruno");
    await created(s, ANA, "nova");
    s.advanceHours(1);
    const apagada = await created(s, ANA, "apagada");
    await s.remove.execute({ ownerId: ANA, inboxId: apagada.id });

    const listed = await s.list.execute({ ownerId: ANA });

    expect(listed.map((i) => [i.address, i.status])).toEqual([
      ["nova", "active"],
      ["velha", "active"],
      ["apagada", "expired"],
    ]);
    expect(velha.id).toBeDefined();
  });

  it("mostra como expirada a Caixa cujo prazo passou, sem ninguém ter apagado", async () => {
    const s = setup();
    await created(s, ANA, "teste");
    s.advanceHours(25);

    const listed = await s.list.execute({ ownerId: ANA });

    expect(listed[0]).toMatchObject({ address: "teste", status: "expired", kept: false });
  });

  it("devolve lista vazia para quem não tem Caixas", async () => {
    expect(await setup().list.execute({ ownerId: ANA })).toEqual([]);
  });
});

describe("SetInboxKeptUseCase", () => {
  it("manter tira o prazo", async () => {
    const s = setup();
    const inbox = await created(s, ANA);

    const result = await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });

    expect(result.ok && result.value).toMatchObject({ kept: true, expiresAt: null, status: "active" });
  });

  it("deixar de manter devolve o prazo, contado a partir de agora", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });
    s.advanceHours(10);

    const result = await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: false });

    expect(result.ok && result.value).toMatchObject({
      kept: false,
      expiresAt: "2026-11-06T22:00:00.000Z",
    });
  });

  it("não renova o prazo se a Caixa já não estava mantida", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    s.advanceHours(10);

    const result = await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: false });

    expect(result.ok && result.value.expiresAt).toBe("2026-11-06T12:00:00.000Z");
  });

  it("manter duas vezes é inofensivo", async () => {
    const s = setup();
    const inbox = await created(s, ANA);

    await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });
    const again = await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });

    expect(again.ok && again.value.kept).toBe(true);
  });

  it("recusa Caixa expirada: é preciso reativar", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    s.advanceHours(25);

    const result = await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });

    expect(result).toEqual({ ok: false, error: { code: "not_active" } });
  });

  it("trata a Caixa de outro Membro e uma inexistente como não encontradas", async () => {
    const s = setup();
    const bruno = await created(s, BRUNO);

    const alheia = await s.setKept.execute({ ownerId: ANA, inboxId: bruno.id, kept: true });
    const inexistente = await s.setKept.execute({ ownerId: ANA, inboxId: "nada", kept: true });

    expect(alheia).toEqual({ ok: false, error: { code: "not_found" } });
    expect(inexistente).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("DeleteInboxUseCase", () => {
  it("apagar expira a Caixa na hora", async () => {
    const s = setup();
    const inbox = await created(s, ANA);

    const result = await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });

    expect(result.ok && result.value).toMatchObject({ status: "expired", kept: false });
    expect((await s.list.execute({ ownerId: ANA }))[0].status).toBe("expired");
  });

  it("apaga também uma Caixa mantida", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    await s.setKept.execute({ ownerId: ANA, inboxId: inbox.id, kept: true });

    const result = await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });

    expect(result.ok && result.value.status).toBe("expired");
  });

  it("apagar de novo é inofensivo e não muda o instante em que expirou", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    const first = await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });
    s.advanceHours(5);

    const again = await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });

    expect(again.ok && first.ok && again.value.expiresAt).toBe(first.ok && first.value.expiresAt);
  });

  it("não apaga a Caixa de outro Membro", async () => {
    const s = setup();
    const bruno = await created(s, BRUNO);

    const result = await s.remove.execute({ ownerId: ANA, inboxId: bruno.id });

    expect(result).toEqual({ ok: false, error: { code: "not_found" } });
    expect((await s.list.execute({ ownerId: BRUNO }))[0].status).toBe("active");
  });
});

describe("ReactivateInboxUseCase", () => {
  it("reativa uma Caixa expirada com novo prazo", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });
    s.advanceHours(5);

    const result = await s.reactivate.execute({ ownerId: ANA, inboxId: inbox.id });

    expect(result.ok && result.value).toMatchObject({
      id: inbox.id,
      status: "active",
      kept: false,
      expiresAt: "2026-11-06T17:00:00.000Z",
    });
  });

  it("reativa e mantém, se pedido", async () => {
    const s = setup();
    const inbox = await created(s, ANA);
    await s.remove.execute({ ownerId: ANA, inboxId: inbox.id });

    const result = await s.reactivate.execute({ ownerId: ANA, inboxId: inbox.id, keep: true });

    expect(result.ok && result.value).toMatchObject({ status: "active", kept: true, expiresAt: null });
  });

  it("recusa reativar uma Caixa que ainda está ativa", async () => {
    const s = setup();
    const inbox = await created(s, ANA);

    const result = await s.reactivate.execute({ ownerId: ANA, inboxId: inbox.id });

    expect(result).toEqual({ ok: false, error: { code: "not_expired" } });
  });

  it("não reativa a Caixa de outro Membro", async () => {
    const s = setup();
    const bruno = await created(s, BRUNO);
    await s.remove.execute({ ownerId: BRUNO, inboxId: bruno.id });

    const result = await s.reactivate.execute({ ownerId: ANA, inboxId: bruno.id });

    expect(result).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("respeita o limite de Caixas ativas", async () => {
    const s = setup({ max: 1 });
    const antiga = await created(s, ANA, "antiga");
    await s.remove.execute({ ownerId: ANA, inboxId: antiga.id });
    await created(s, ANA, "nova");

    const result = await s.reactivate.execute({ ownerId: ANA, inboxId: antiga.id });

    expect(result).toEqual({ ok: false, error: { code: "limit_reached", max: 1 } });
  });
});

describe("CheckAddressUseCase", () => {
  it("diz o que aconteceria ao criar o endereço", async () => {
    const s = setup();
    const minha = await created(s, ANA, "minha-ativa");
    const expirada = await created(s, ANA, "minha-expirada");
    await s.remove.execute({ ownerId: ANA, inboxId: expirada.id });
    await created(s, BRUNO, "do-bruno");

    const check = (address: string) => s.check.execute({ ownerId: ANA, address });

    expect(await check("livre-agora")).toEqual({ availability: "free" });
    expect(await check("minha-ativa")).toEqual({ availability: "yours_active" });
    expect(await check("Minha-Expirada")).toEqual({ availability: "yours_expired" });
    expect(await check("do-bruno")).toEqual({ availability: "taken" });
    expect(await check("a")).toEqual({ availability: "invalid", problem: "length" });
    expect(await check("a b c")).toEqual({ availability: "invalid", problem: "characters" });
    expect(minha.id).toBeDefined();
  });
});

describe("describeInboxError", () => {
  it("tem uma mensagem em português para cada erro, citando o limite quando é o caso", () => {
    expect(describeInboxError({ code: "limit_reached", max: 20 })).toContain("20 Caixas ativas");
    expect(describeInboxError({ code: "address_taken" })).toContain("outro membro");
    expect(describeInboxError({ code: "invalid_address", problem: "length" })).toContain("3 a 40");
    for (const code of ["already_active", "not_found", "not_active", "not_expired"] as const) {
      expect(describeInboxError({ code }).length).toBeGreaterThan(10);
    }
  });
});
