import { handleMcpRequest } from "@/composition/mcp";

// O SDK do MCP precisa do Node (pg, LISTEN). É o padrão, mas fica explícito.
export const runtime = "nodejs";

/**
 * Servidor MCP remoto (Streamable HTTP, sem sessão). Autenticado por Chave de
 * API em `Authorization: Bearer tm_…` ou `X-API-Key`. GET e DELETE existem só
 * para responder aos clientes de 2025 (o SDK devolve 405: não há sessão).
 */
export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
