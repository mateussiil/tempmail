import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";

describe("runMigrations", () => {
  it("pula sem tocar no banco quando ainda não há migrations geradas", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "tempmail-migrations-"));
    const pool = {} as Pool; // qualquer uso do pool quebraria o teste

    await expect(runMigrations(pool, folder)).resolves.toBe("skipped");
  });
});
