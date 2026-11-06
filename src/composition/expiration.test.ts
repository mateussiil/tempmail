// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ExpirationJob } from "./expiration";

function job(overrides: Partial<ConstructorParameters<typeof ExpirationJob>[0]> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const deps: ConstructorParameters<typeof ExpirationJob>[0] = {
    lock: async (fn) => ({ ran: true, value: await fn() }),
    departed: {
      execute: async () => {
        calls.push("departed");
        return { status: "found" as const, memberIds: ["u-bruno"] };
      },
    },
    expireOwners: {
      execute: async ({ ownerIds }) => {
        calls.push(`expire:${ownerIds.join(",")}`);
        return { expiredInboxes: 3 };
      },
    },
    purge: {
      execute: async () => {
        calls.push("purge");
        return { purgedInboxes: 4, deletedMessages: 9, failedInboxes: 0 };
      },
    },
    sweep: {
      execute: async () => {
        calls.push("sweep");
        return { deletedFiles: 2 };
      },
    },
    log: (event) => logs.push(event),
    ...overrides,
  };
  return { job: new ExpirationJob(deps), calls, logs };
}

describe("ExpirationJob", () => {
  it("roda saída do time, expiração e varredura, nessa ordem, e relata", async () => {
    const t = job();

    const report = await t.job.run();

    expect(t.calls).toEqual(["departed", "expire:u-bruno", "purge", "sweep"]);
    expect(report).toEqual({
      departedMembers: 1,
      expiredInboxes: 3,
      purgedInboxes: 4,
      deletedMessages: 9,
      failedInboxes: 0,
      sweptFiles: 2,
      failedSteps: [],
    });
    expect(t.logs).toContain("expiration.run");
  });

  it("com outra execução em andamento, pula sem fazer nada", async () => {
    const t = job({ lock: async () => ({ ran: false }) });

    expect(await t.job.run()).toEqual({ skipped: "locked" });
    expect(t.calls).toEqual([]);
  });

  it("lista vazia não expira ninguém, mas a limpeza segue", async () => {
    const t = job({ departed: { execute: async () => ({ status: "skipped_empty_allowlist" as const }) } });

    const report = await t.job.run();

    expect(report).toMatchObject({ departedMembers: "skipped_empty_allowlist", expiredInboxes: 0, purgedInboxes: 4 });
    expect(t.calls).toEqual(["purge", "sweep"]);
    expect(t.logs).toContain("expiration.empty_allowlist");
  });

  it("sem ninguém saindo, não chama a expiração", async () => {
    const t = job({ departed: { execute: async () => ({ status: "found" as const, memberIds: [] }) } });

    await t.job.run();

    expect(t.calls).toEqual(["purge", "sweep"]);
  });

  it("um passo que falha não impede os outros", async () => {
    const t = job({
      purge: {
        execute: async () => {
          throw new Error("banco caiu");
        },
      },
    });

    const report = await t.job.run();

    expect(report).toMatchObject({ failedSteps: ["purge"], sweptFiles: 2, expiredInboxes: 3 });
    expect(t.logs).toContain("expiration.step_failed");
  });

  it("sem R2, não varre", async () => {
    const t = job({ sweep: null });

    expect(await t.job.run()).toMatchObject({ sweptFiles: null });
  });
});
