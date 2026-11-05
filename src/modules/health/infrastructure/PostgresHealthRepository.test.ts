import { describe, expect, it } from "vitest";
import { PostgresHealthRepository } from "./PostgresHealthRepository";

describe("PostgresHealthRepository", () => {
  it("responde true quando a consulta funciona", async () => {
    const repository = new PostgresHealthRepository({ query: async () => ({}) });

    await expect(repository.pingDatabase()).resolves.toBe(true);
  });

  it("responde false, sem lançar, quando a consulta falha", async () => {
    const repository = new PostgresHealthRepository({
      query: async () => {
        throw new Error("connection refused");
      },
    });

    await expect(repository.pingDatabase()).resolves.toBe(false);
  });
});
