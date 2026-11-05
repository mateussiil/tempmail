import { describe, expect, it } from "vitest";
import { Allowlist } from "../domain/Allowlist";
import { FakeSessionReader } from "../testing/FakeSessionReader";
import { GetCurrentMemberUseCase } from "./GetCurrentMemberUseCase";
import type { SessionUser } from "./SessionReader";

const ana: SessionUser = { id: "u1", githubUsername: "ana", name: "Ana", image: null };

function useCase(user: SessionUser | null, list: string, allowlistFn?: () => Allowlist) {
  return new GetCurrentMemberUseCase(
    new FakeSessionReader(user),
    allowlistFn ?? (() => Allowlist.fromString(list)),
  );
}

describe("GetCurrentMemberUseCase", () => {
  it("é anônimo quando não há sessão", async () => {
    await expect(useCase(null, "ana").execute()).resolves.toEqual({ status: "anonymous" });
  });

  it("é Membro quando o username está na lista", async () => {
    const result = await useCase(ana, "ana,bruno").execute();

    expect(result.status).toBe("member");
    if (result.status === "member") {
      expect(result.member.githubUsername).toBe("ana");
      expect(result.member.name).toBe("Ana");
    }
  });

  it("tem acesso encerrado quando o username saiu da lista", async () => {
    await expect(useCase(ana, "bruno").execute()).resolves.toEqual({
      status: "revoked",
      githubUsername: "ana",
    });
  });

  it("falha fechada com a lista vazia, mesmo com sessão válida", async () => {
    const result = await useCase(ana, "").execute();

    expect(result.status).toBe("revoked");
  });

  it("trata sessão sem username do GitHub como acesso encerrado", async () => {
    const result = await useCase({ ...ana, githubUsername: null }, "ana").execute();

    expect(result).toEqual({ status: "revoked", githubUsername: null });
  });

  it("relê a lista a cada chamada: remover o username corta o acesso no pedido seguinte", async () => {
    let raw = "ana";
    const current = useCase(ana, "", () => Allowlist.fromString(raw));

    expect((await current.execute()).status).toBe("member");
    raw = "bruno";
    expect((await current.execute()).status).toBe("revoked");
  });
});
