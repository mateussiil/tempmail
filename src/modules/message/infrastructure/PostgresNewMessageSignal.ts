import type { Client } from "pg";
import type { NewMessageSignal, Unsubscribe } from "../application/ports";
import { MESSAGE_CHANNEL } from "./DrizzleMessageRepository";

type Log = (event: string, data?: Record<string, unknown>) => void;

/**
 * Escuta o `NOTIFY inbox_message` numa **única conexão** dedicada por processo
 * (fora do pool, que tem só 10) e reparte os avisos entre quem espera cada Caixa.
 * Cem `wait_for_email` ao mesmo tempo usam uma conexão só.
 *
 * Se a conexão cair, acorda todo mundo (pra conferirem o banco) e reconecta
 * enquanto houver alguém escutando. A conexão fica aberta depois que o último
 * sai: é uma só, e reabrir a cada espera custaria mais.
 */
export class PostgresNewMessageSignal implements NewMessageSignal {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(
    private readonly newClient: () => Client,
    private readonly log: Log = () => {},
  ) {}

  async subscribe(inboxId: string, onMessage: () => void): Promise<Unsubscribe> {
    const set = this.listeners.get(inboxId) ?? new Set();
    set.add(onMessage);
    this.listeners.set(inboxId, set);

    const unsubscribe = async () => {
      set.delete(onMessage);
      if (set.size === 0 && this.listeners.get(inboxId) === set) this.listeners.delete(inboxId);
    };

    try {
      await this.ensureListening();
    } catch (error) {
      await unsubscribe();
      throw error;
    }
    return unsubscribe;
  }

  /** Fecha a conexão (testes e desligamento). */
  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.listeners.clear();
    await client?.end().catch(() => {});
  }

  private async ensureListening(): Promise<void> {
    if (this.client) return;
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  private async connect(): Promise<void> {
    const client = this.newClient();
    client.on("notification", (notification) => this.dispatch(notification.payload));
    client.on("error", (error) => this.lost(client, error));
    client.on("end", () => this.lost(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${MESSAGE_CHANNEL}`);
    } catch (error) {
      await client.end().catch(() => {});
      throw error;
    }
    this.client = client;
  }

  private dispatch(payload: string | undefined): void {
    let inboxId: unknown;
    try {
      inboxId = (JSON.parse(payload ?? "") as { inboxId?: unknown }).inboxId;
    } catch {
      return;
    }
    if (typeof inboxId !== "string") return;
    for (const listener of this.listeners.get(inboxId) ?? []) listener();
  }

  private lost(client: Client, error?: Error): void {
    if (this.client !== client) return;
    this.client = null;
    this.log("mcp.listen_lost", { reason: error?.message ?? "end" });
    client.end().catch(() => {});

    // Quem espera confere o banco agora; a espera também confere sozinha a cada intervalo.
    for (const set of this.listeners.values()) for (const listener of set) listener();

    if (this.listeners.size > 0) {
      this.ensureListening().catch((reconnectError: Error) =>
        this.log("mcp.listen_reconnect_failed", { reason: reconnectError.message }),
      );
    }
  }
}
