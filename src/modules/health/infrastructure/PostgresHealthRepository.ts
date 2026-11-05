import type { HealthRepository } from "../application/HealthRepository";

type Queryable = { query: (text: string) => Promise<unknown> };

export class PostgresHealthRepository implements HealthRepository {
  constructor(private readonly db: Queryable) {}

  async pingDatabase(): Promise<boolean> {
    try {
      await this.db.query("select 1");
      return true;
    } catch {
      // Sem DATABASE_URL, banco fora do ar ou timeout: tudo isso é "down".
      return false;
    }
  }
}
