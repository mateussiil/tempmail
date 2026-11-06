import { describe, expect, it } from "vitest";
import { Allowlist } from "../domain/Allowlist";
import { FindDepartedMembersUseCase } from "./FindDepartedMembersUseCase";

const members = {
  listMembers: async () => [
    { id: "u-ana", githubUsername: "Ana" },
    { id: "u-bruno", githubUsername: "bruno" },
    { id: "u-sem", githubUsername: null },
  ],
};

describe("FindDepartedMembersUseCase", () => {
  it("acha quem não está mais na lista (sem diferenciar maiúsculas)", async () => {
    const find = new FindDepartedMembersUseCase({ members, allowlist: () => Allowlist.fromString("ana, carla") });

    expect(await find.execute()).toEqual({ status: "found", memberIds: ["u-bruno", "u-sem"] });
  });

  it("lista vazia não conta como todo mundo saiu", async () => {
    const find = new FindDepartedMembersUseCase({ members, allowlist: () => Allowlist.fromString(" , ") });

    expect(await find.execute()).toEqual({ status: "skipped_empty_allowlist" });
  });
});
