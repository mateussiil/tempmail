import { describe, expect, it } from "vitest";
import { Inbox, InboxStateError } from "./Inbox";
import { InboxPolicy } from "./InboxPolicy";

const policy = new InboxPolicy(20, 24);
const t0 = new Date("2026-11-05T12:00:00Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);

function open() {
  return Inbox.open({ id: "i1", address: "teste", ownerId: "ana", now: t0, policy, mascot: "hermes" });
}

describe("Inbox", () => {
  it("abre ativa, com prazo de 24 h e sem estar mantida", () => {
    const inbox = open();

    expect(inbox.expiresAt).toEqual(hours(24));
    expect(inbox.isActive(t0)).toBe(true);
    expect(inbox.isKept(t0)).toBe(false);
    expect(inbox.isOwnedBy("ana")).toBe(true);
    expect(inbox.isOwnedBy("bruno")).toBe(false);
  });

  it("expira quando o prazo passa", () => {
    const inbox = open();

    expect(inbox.isActive(hours(23))).toBe(true);
    expect(inbox.isActive(hours(24))).toBe(false);
    expect(inbox.isActive(hours(25))).toBe(false);
  });

  it("manter tira o prazo e a Caixa nunca expira sozinha", () => {
    const kept = open().keep(t0);

    expect(kept.expiresAt).toBeNull();
    expect(kept.isKept(t0)).toBe(true);
    expect(kept.isActive(hours(24 * 365))).toBe(true);
  });

  it("deixar de manter devolve o prazo, contado a partir de agora", () => {
    const released = open().keep(t0).release(hours(10), policy);

    expect(released.expiresAt).toEqual(hours(34));
    expect(released.isKept(hours(10))).toBe(false);
  });

  it("apagar expira agora, inclusive uma Caixa mantida", () => {
    const deleted = open().keep(t0).expire(hours(2));

    expect(deleted.isActive(hours(2))).toBe(false);
    expect(deleted.expiresAt).toEqual(hours(2));
  });

  it("apagar uma Caixa já expirada não muda nada", () => {
    const inbox = open();
    const later = hours(30);

    expect(inbox.expire(later)).toBe(inbox);
  });

  it("reativar uma Caixa expirada dá novo prazo, ou mantém se pedido", () => {
    const expired = open().expire(hours(1));

    expect(expired.reactivate(hours(5), policy, false).expiresAt).toEqual(hours(29));
    expect(expired.reactivate(hours(5), policy, true).expiresAt).toBeNull();
  });

  it("reativar preserva o endereço, o Dono e a data de criação", () => {
    const reactivated = open().expire(hours(1)).reactivate(hours(5), policy, false);

    expect(reactivated.address).toBe("teste");
    expect(reactivated.ownerId).toBe("ana");
    expect(reactivated.createdAt).toEqual(t0);
  });

  it("recusa transições inválidas", () => {
    const active = open();
    const expired = active.expire(hours(1));

    expect(() => active.reactivate(hours(2), policy, false)).toThrow(InboxStateError);
    expect(() => expired.keep(hours(2))).toThrow(InboxStateError);
    expect(() => expired.release(hours(2), policy)).toThrow(InboxStateError);
  });
});
