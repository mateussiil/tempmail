import { createMcpHandler } from "mcp-handler";
import { memberAuthInfo, registerTempmailTools, type McpToolDeps } from "../ui/tools";

type JsonRpcMessage = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };

export type ToolCall = {
  /** O `result` do JSON-RPC (o que a ferramenta devolveu). */
  result: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { type: string; text: string }[];
  };
  /** Notificações que vieram no mesmo stream (progresso). */
  notifications: JsonRpcMessage[];
};

/** Lê a resposta, seja JSON ou SSE (`event: message` / `data: …`). */
async function readMessages(response: Response): Promise<JsonRpcMessage[]> {
  const body = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return [JSON.parse(body)];
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

/**
 * Um cliente MCP mínimo, em memória, sobre o mesmo handler que a rota usa (sem
 * HTTP de verdade). Pedidos no formato de 2025 (sem envelope), que o handler
 * atende pelo caminho sem sessão.
 */
export function mcpTestClient(deps: McpToolDeps) {
  const handler = createMcpHandler((server) => registerTempmailTools(server, deps), {
    serverInfo: { name: "tempmail-test", version: "0.0.0" },
  });
  let nextId = 1;

  async function send(
    method: string,
    params: Record<string, unknown>,
    options: { memberId?: string | null; signal?: AbortSignal } = {},
  ) {
    const request = new Request("http://tempmail.test/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      signal: options.signal,
    });
    const memberId = options.memberId === undefined ? "ana" : options.memberId;
    if (memberId !== null) request.auth = memberAuthInfo(memberId);
    return handler(request);
  }

  return {
    send,
    async listTools(): Promise<{ name: string; annotations?: Record<string, boolean> }[]> {
      const [message] = await readMessages(await send("tools/list", {}));
      return (message.result as { tools: { name: string; annotations?: Record<string, boolean> }[] }).tools;
    },
    async call(
      name: string,
      args: Record<string, unknown> = {},
      options: { memberId?: string | null; progressToken?: string; signal?: AbortSignal } = {},
    ): Promise<ToolCall> {
      const params: Record<string, unknown> = { name, arguments: args };
      if (options.progressToken) params._meta = { progressToken: options.progressToken };
      const messages = await readMessages(await send("tools/call", params, options));
      const response = messages.find((m) => m.id !== undefined);
      if (!response || response.error) throw new Error(`Erro do protocolo: ${JSON.stringify(response?.error)}`);
      return {
        result: response.result as ToolCall["result"],
        notifications: messages.filter((m) => m.id === undefined),
      };
    },
  };
}
