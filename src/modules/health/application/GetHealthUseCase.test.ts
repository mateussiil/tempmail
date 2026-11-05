import { describe, expect, it } from "vitest";
import { FakeHealthRepository } from "../testing/FakeHealthRepository";
import { GetHealthUseCase } from "./GetHealthUseCase";

const fixedNow = new Date("2026-11-05T12:00:00Z");

describe("GetHealthUseCase", () => {
  it("está saudável quando o banco responde", async () => {
    const useCase = new GetHealthUseCase(new FakeHealthRepository(true), () => fixedNow);

    const status = await useCase.execute();

    expect(status.healthy).toBe(true);
    expect(status.database).toBe("up");
    expect(status.checkedAt).toEqual(fixedNow);
  });

  it("não está saudável quando o banco não responde", async () => {
    const useCase = new GetHealthUseCase(new FakeHealthRepository(false), () => fixedNow);

    const status = await useCase.execute();

    expect(status.healthy).toBe(false);
    expect(status.database).toBe("down");
  });
});
