export interface HealthRepository {
  /** `true` se o banco respondeu; nunca lança, falha de conexão vira `false`. */
  pingDatabase(): Promise<boolean>;
}
