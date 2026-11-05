import { describe, expect, it } from "vitest";
import { makeInboxDeps } from "../testing/inboxTestDeps";
import { CreateInboxUseCase } from "./CreateInboxUseCase";
import { DeleteInboxUseCase } from "./DeleteInboxUseCase";
import { ExpireInboxesOfOwnersUseCase } from "./ExpireInboxesOfOwnersUseCase";
import { ReactivateInboxUseCase } from "./ReactivateInboxUseCase";
import { SetInboxKeptUseCase } from "./SetInboxKeptUseCase";

describe("ExpireInboxesOfOwnersUseCase", () => {
  it("expira todas as Caixas ativas de quem saiu, inclusive as mantidas, e só delas", async () => {
    const t = makeInboxDeps();
    const create = new CreateInboxUseCase(t.deps);
    const a = await create.execute({ ownerId: "bruno", address: "do-bruno" });
    const kept = await create.execute({ ownerId: "bruno", address: "mantida" });
    const other = await create.execute({ ownerId: "ana", address: "da-ana" });
    if (!a.ok || !kept.ok || !other.ok) throw new Error();
    await new SetInboxKeptUseCase(t.deps).execute({ ownerId: "bruno", inboxId: kept.value.inbox.id, kept: true });

    const result = await new ExpireInboxesOfOwnersUseCase(t.deps).execute({ ownerIds: ["bruno"] });

    expect(result).toEqual({ expiredInboxes: 2 });
    const now = t.now();
    expect((await t.repository.findById(a.value.inbox.id))?.isActive(now)).toBe(false);
    expect((await t.repository.findById(kept.value.inbox.id))?.isActive(now)).toBe(false);
    expect((await t.repository.findById(other.value.inbox.id))?.isActive(now)).toBe(true);
    // O endereço continua dele.
    expect((await t.repository.findByAddress("do-bruno"))?.ownerId).toBe("bruno");
  });

  it("repetir não faz mal", async () => {
    const t = makeInboxDeps();
    await new CreateInboxUseCase(t.deps).execute({ ownerId: "bruno" });
    const expire = new ExpireInboxesOfOwnersUseCase(t.deps);

    await expire.execute({ ownerIds: ["bruno"] });
    expect(await expire.execute({ ownerIds: ["bruno"] })).toEqual({ expiredInboxes: 0 });
  });
});

describe("reativar recomeça vazia", () => {
  it("Reativar esvazia a Caixa antes de devolvê-la", async () => {
    const t = makeInboxDeps();
    const created = await new CreateInboxUseCase(t.deps).execute({ ownerId: "ana", address: "volta" });
    if (!created.ok) throw new Error();
    await new DeleteInboxUseCase(t.deps).execute({ ownerId: "ana", inboxId: created.value.inbox.id });

    await new ReactivateInboxUseCase(t.deps).execute({ ownerId: "ana", inboxId: created.value.inbox.id });

    expect(t.contents.cleared).toEqual([created.value.inbox.id]);
  });

  it("criar um endereço seu expirado (que reativa) também esvazia", async () => {
    const t = makeInboxDeps();
    const create = new CreateInboxUseCase(t.deps);
    const created = await create.execute({ ownerId: "ana", address: "volta" });
    if (!created.ok) throw new Error();
    await new DeleteInboxUseCase(t.deps).execute({ ownerId: "ana", inboxId: created.value.inbox.id });

    const again = await create.execute({ ownerId: "ana", address: "volta" });

    expect(again.ok && again.value.reactivated).toBe(true);
    expect(t.contents.cleared).toEqual([created.value.inbox.id]);
  });

  it("criar uma Caixa nova não esvazia nada", async () => {
    const t = makeInboxDeps();
    await new CreateInboxUseCase(t.deps).execute({ ownerId: "ana", address: "nova" });

    expect(t.contents.cleared).toEqual([]);
  });
});
