import { describe, expect, it } from "vitest";
import { Allowlist } from "./Allowlist";

describe("Allowlist", () => {
  it("autoriza os usernames da lista, sem diferenciar maiúsculas", () => {
    const list = Allowlist.fromString("ana,Bruno");

    expect(list.allows("ana")).toBe(true);
    expect(list.allows("ANA")).toBe(true);
    expect(list.allows("bruno")).toBe(true);
    expect(list.allows("carla")).toBe(false);
  });

  it("ignora espaços, arroba e entradas vazias", () => {
    const list = Allowlist.fromString(" @ana , ,bruno,, ");

    expect(list.allows("ana")).toBe(true);
    expect(list.allows("@bruno")).toBe(true);
    expect(list.allows("")).toBe(false);
  });

  it("falha fechada: lista vazia ou ausente não autoriza ninguém", () => {
    expect(Allowlist.fromString("").allows("ana")).toBe(false);
    expect(Allowlist.fromString("  , ").allows("ana")).toBe(false);
    expect(Allowlist.fromString(undefined).allows("ana")).toBe(false);
  });

  it("não autoriza username ausente", () => {
    const list = Allowlist.fromString("ana");

    expect(list.allows(null)).toBe(false);
    expect(list.allows(undefined)).toBe(false);
  });

  it("não confunde um username com prefixo de outro", () => {
    const list = Allowlist.fromString("ana");

    expect(list.allows("ana-silva")).toBe(false);
    expect(list.allows("an")).toBe(false);
  });
});
