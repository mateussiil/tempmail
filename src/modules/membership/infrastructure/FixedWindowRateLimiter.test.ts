import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./FixedWindowRateLimiter";

const t0 = new Date("2026-11-05T12:00:00.000Z");
const after = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe("FixedWindowRateLimiter", () => {
  it("deixa passar o limite e recusa o seguinte, dizendo quando tentar de novo", () => {
    const limiter = new FixedWindowRateLimiter(3);

    expect(limiter.hit("k", t0)).toEqual({ allowed: true });
    expect(limiter.hit("k", after(1))).toEqual({ allowed: true });
    expect(limiter.hit("k", after(2))).toEqual({ allowed: true });
    expect(limiter.hit("k", after(20))).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("recomeça quando a janela de um minuto passa", () => {
    const limiter = new FixedWindowRateLimiter(1);
    limiter.hit("k", t0);

    expect(limiter.hit("k", after(59)).allowed).toBe(false);
    expect(limiter.hit("k", after(60))).toEqual({ allowed: true });
  });

  it("conta cada chave separado", () => {
    const limiter = new FixedWindowRateLimiter(1);
    limiter.hit("a", t0);

    expect(limiter.hit("a", t0).allowed).toBe(false);
    expect(limiter.hit("b", t0).allowed).toBe(true);
  });

  it("o 61º pedido no minuto é recusado com o limite padrão", () => {
    const limiter = new FixedWindowRateLimiter(60);
    for (let i = 0; i < 60; i++) expect(limiter.hit("k", t0).allowed).toBe(true);

    expect(limiter.hit("k", t0).allowed).toBe(false);
  });
});
