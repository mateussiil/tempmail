import { HealthStatus } from "../domain/HealthStatus";
import type { HealthRepository } from "./HealthRepository";

export class GetHealthUseCase {
  constructor(
    private readonly repository: HealthRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<HealthStatus> {
    const reachable = await this.repository.pingDatabase();
    return HealthStatus.fromDatabasePing(reachable, this.clock());
  }
}
