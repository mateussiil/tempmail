import { describe, expect, it } from "vitest";
import { defaultMascotFor, isMascotId, MASCOTS } from "../domain/Mascot";
import { makeInboxDeps } from "../testing/inboxTestDeps";
import { CreateInboxUseCase } from "./CreateInboxUseCase";
import { DeleteInboxUseCase } from "./DeleteInboxUseCase";
import { SetInboxMascotUseCase } from "./SetInboxMascotUseCase";

describe("mascote da Caixa", () => {
  it("a turma tem 15 mensageiros com id, nome e frase", () => {
    expect(MASCOTS).toHaveLength(15);
    expect(new Set(MASCOTS.map((m) => m.id)).size).toBe(15);
    expect(isMascotId("capivara")).toBe(true);
    expect(isMascotId("dragao")).toBe(false);
  });

  it("criar com mascote guarda a escolha; sem escolha, sorteia", async () => {
    const t = makeInboxDeps();
    const create = new CreateInboxUseCase(t.deps);

    const chosen = await create.execute({ ownerId: "ana", address: "com-mascote", mascot: "polvo" });
    const random = await create.execute({ ownerId: "ana" });

    expect(chosen.ok && chosen.value.inbox.mascot).toBe("polvo");
    expect(random.ok && random.value.inbox.mascot).toBe("corvo");
  });

  it("troca o mascote, inclusive de uma Caixa expirada, e só o Dono troca", async () => {
    const t = makeInboxDeps();
    const created = await new CreateInboxUseCase(t.deps).execute({ ownerId: "ana", address: "troca" });
    if (!created.ok) throw new Error();
    const id = created.value.inbox.id;
    await new DeleteInboxUseCase(t.deps).execute({ ownerId: "ana", inboxId: id });
    const set = new SetInboxMascotUseCase(t.deps);

    const changed = await set.execute({ ownerId: "ana", inboxId: id, mascot: "baleia" });
    expect(changed.ok && changed.value).toMatchObject({ mascot: "baleia", status: "expired" });
    expect((await t.repository.findById(id))?.mascot).toBe("baleia");

    expect(await set.execute({ ownerId: "bruno", inboxId: id, mascot: "gato" })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("criar de novo um endereço expirado com outro mascote reativa com o novo", async () => {
    const t = makeInboxDeps();
    const create = new CreateInboxUseCase(t.deps);
    const first = await create.execute({ ownerId: "ana", address: "volta", mascot: "gato" });
    if (!first.ok) throw new Error();
    await new DeleteInboxUseCase(t.deps).execute({ ownerId: "ana", inboxId: first.value.inbox.id });

    const again = await create.execute({ ownerId: "ana", address: "volta", mascot: "lontra" });
    const keep = await create.execute({ ownerId: "ana", address: "outra", mascot: "coruja" });

    expect(again.ok && again.value).toMatchObject({ reactivated: true, inbox: { mascot: "lontra" } });
    expect(keep.ok && keep.value.inbox.mascot).toBe("coruja");
  });

  it("Caixas de antes da escolha ganham sempre o mesmo mascote pelo endereço", () => {
    expect(defaultMascotFor("k7f3qx9m")).toBe(defaultMascotFor("k7f3qx9m"));
    expect(isMascotId(defaultMascotFor("qualquer-coisa"))).toBe(true);
    const spread = new Set(Array.from({ length: 200 }, (_, i) => defaultMascotFor(`caixa-${i}`)));
    expect(spread.size).toBe(15);
  });
});
