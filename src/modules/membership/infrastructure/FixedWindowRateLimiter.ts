import type { RateLimitDecision, RateLimiter } from "../application/RateLimiter";

const WINDOW_MS = 60_000;

/**
 * Limite por janela fixa de um minuto, na memória do processo. Vale porque o
 * tempmail roda numa instância só; com mais de uma, cada uma contaria separado.
 */
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly limitPerMinute: number) {}

  hit(key: string, now: Date): RateLimitDecision {
    const time = now.getTime();
    this.dropExpired(time);

    const current = this.windows.get(key);
    if (!current || time - current.startedAt >= WINDOW_MS) {
      this.windows.set(key, { startedAt: time, count: 1 });
      return { allowed: true };
    }

    if (current.count >= this.limitPerMinute) {
      const retryAfterMs = current.startedAt + WINDOW_MS - time;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    current.count += 1;
    return { allowed: true };
  }

  /** Chaves paradas não ficam na memória pra sempre. */
  private dropExpired(time: number) {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (time - window.startedAt >= WINDOW_MS) this.windows.delete(key);
    }
  }
}
