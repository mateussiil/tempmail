import type { HealthRepository } from "../application/HealthRepository";

export class FakeHealthRepository implements HealthRepository {
  constructor(private readonly reachable: boolean) {}

  async pingDatabase(): Promise<boolean> {
    return this.reachable;
  }
}
