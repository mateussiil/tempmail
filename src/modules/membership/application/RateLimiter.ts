export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Conta um pedido para a chave e diz se ainda cabe no limite. */
  hit(key: string, now: Date): RateLimitDecision;
}
