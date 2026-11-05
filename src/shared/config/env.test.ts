import { describe, expect, it } from "vitest";
import { missingAuthEnv } from "./env";

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
