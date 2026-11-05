export type DatabaseState = "up" | "down";

/** Estado de saúde do app: por enquanto, só se o banco responde. */
export class HealthStatus {
  private constructor(
    readonly database: DatabaseState,
    readonly checkedAt: Date,
  ) {}

  static fromDatabasePing(reachable: boolean, checkedAt: Date): HealthStatus {
    return new HealthStatus(reachable ? "up" : "down", checkedAt);
  }

  get healthy(): boolean {
    return this.database === "up";
  }
}
