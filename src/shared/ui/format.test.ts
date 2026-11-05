import { describe, expect, it } from "vitest";
import { deadlineLong, deadlineShort, formatBytes, timeAgo } from "./format";

const now = new Date(2026, 10, 5, 14, 0, 0);
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
const min = 60_000;
const h = 60 * min;

describe("timeAgo", () => {
  it("vai de agora a datas antigas", () => {
    expect(timeAgo(at(-20_000), now)).toBe("agora");
    expect(timeAgo(at(-4 * min), now)).toBe("há 4 min");
    expect(timeAgo(at(-2 * h), now)).toBe("há 2 h");
    expect(timeAgo(new Date(2026, 10, 5, 0, 30).toISOString(), now)).toBe("hoje às 00:30");
    expect(timeAgo(new Date(2026, 10, 4, 9, 5).toISOString(), now)).toBe("ontem às 09:05");
    expect(timeAgo(new Date(2026, 9, 20, 18, 0).toISOString(), now)).toBe("20/10 às 18:00");
    expect(timeAgo(new Date(2025, 9, 20, 18, 0).toISOString(), now)).toBe("20/10/2025 às 18:00");
  });
});

describe("prazo da Caixa", () => {
  const active = (ms: number) => ({ status: "active" as const, kept: false, expiresAt: at(ms) });

  it("curto, para a lista", () => {
    expect(deadlineShort(active(23 * h + 12 * min), now)).toBe("expira em 23 h");
    expect(deadlineShort(active(40 * min), now)).toBe("expira em 40 min");
    expect(deadlineShort({ status: "active", kept: true, expiresAt: null }, now)).toBe("mantida");
    expect(deadlineShort({ status: "expired", kept: false, expiresAt: at(-2 * h) }, now)).toBe("expirou há 2 h");
  });

  it("completo, para o cabeçalho", () => {
    expect(deadlineLong(active(23 * h + 12 * min), now)).toBe("Expira em 23 h 12 min");
    expect(deadlineLong(active(5 * h), now)).toBe("Expira em 5 h");
    expect(deadlineLong(active(30_000), now)).toBe("Expira em menos de 1 min");
    expect(deadlineLong({ status: "active", kept: true, expiresAt: null }, now)).toBe("Mantida, sem prazo");
  });
});

describe("formatBytes", () => {
  it("usa a unidade certa, com vírgula", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12_400)).toBe("12 KB");
    expect(formatBytes(1_468_006)).toBe("1,4 MB");
  });
});
