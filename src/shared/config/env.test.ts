import { describe, expect, it } from "vitest";
import { mailDomain, missingAuthEnv, positiveIntEnv } from "./env";

describe("positiveIntEnv", () => {
  it("usa o padrão quando a variável está ausente ou vazia", () => {
    expect(positiveIntEnv("LIMITE", 20, {})).toBe(20);
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "" })).toBe(20);
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "  " })).toBe(20);
  });

  it("lê um inteiro positivo", () => {
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "5" })).toBe(5);
  });

  it("lança, citando a variável, quando o valor é inválido", () => {
    for (const bad of ["0", "-3", "abc", "2.5"]) {
      expect(() => positiveIntEnv("LIMITE", 20, { LIMITE: bad })).toThrow(/LIMITE/);
    }
  });
});

describe("mailDomain", () => {
  it("tem um padrão e aceita sobrescrever, em minúsculas", () => {
    expect(mailDomain({})).toBe("tmp.mateussiil.com.br");
    expect(mailDomain({ MAIL_DOMAIN: " Outro.Exemplo.TEST " })).toBe("outro.exemplo.test");
  });
});

const complete: Record<string, string | undefined> = {
  BETTER_AUTH_URL: "https://exemplo.test",
  BETTER_AUTH_SECRET: "segredo",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "segredo-github",
};

describe("missingAuthEnv", () => {
  it("não aponta nada quando tudo está definido", () => {
    expect(missingAuthEnv(complete)).toEqual([]);
  });

  it("aponta as variáveis ausentes e as vazias, sem expor valores", () => {
    const env = { ...complete, BETTER_AUTH_SECRET: "", GITHUB_CLIENT_ID: undefined };

    expect(missingAuthEnv(env)).toEqual(["BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID"]);
  });
});
