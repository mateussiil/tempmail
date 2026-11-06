import { describe, expect, it } from "vitest";
import { Allowlist } from "../domain/Allowlist";
import { FixedWindowRateLimiter } from "../infrastructure/FixedWindowRateLimiter";
import { AuthenticateOAuthTokenUseCase } from "./AuthenticateOAuthTokenUseCase";

const members = {
  listMembers: async () => [],
  findById: async (id: string) =>
    ({ ana: { id: "ana", githubUsername: "ana", name: "Ana", image: null }, bruno: { id: "bruno", githubUsername: "bruno", name: "Bruno", image: null } })[id] ?? null,
};

function setup(limit = 60) {
  return new AuthenticateOAuthTokenUseCase({
    members,
    allowlist: () => Allowlist.fromString("ana"),
    limiter: new FixedWindowRateLimiter(limit),
    clock: () => new Date("2026-11-06T12:00:00Z"),
  });
}

describe("AuthenticateOAuthTokenUseCase", () => {
  it("token de um Membro da lista vale", async () => {
    const result = await setup().execute({ userId: "ana", clientId: "https://claude.ai/x" });

    expect(result.status === "member" && result.member.githubUsername).toBe("ana");
  });

  it("Membro fora da lista é recusado, mesmo com o token ainda válido", async () => {
    expect(await setup().execute({ userId: "bruno", clientId: "c" })).toEqual({ status: "revoked" });
  });

  it("usuário que não existe é token inválido", async () => {
    expect(await setup().execute({ userId: "fantasma", clientId: "c" })).toEqual({ status: "invalid" });
  });

  it("aplica o limite por Membro e cliente", async () => {
    const auth = setup(2);

    await auth.execute({ userId: "ana", clientId: "c1" });
    await auth.execute({ userId: "ana", clientId: "c1" });
    expect((await auth.execute({ userId: "ana", clientId: "c1" })).status).toBe("rate_limited");
    expect((await auth.execute({ userId: "ana", clientId: "c2" })).status).toBe("member");
  });
});
