import type { Result } from "@/shared/result";

/** Um erro da API, como as rotas devolvem: `{ error, message }`, mais o status HTTP. */
export type ApiError = {
  status: number;
  code: string;
  message: string;
  /** Campos extras do corpo de erro (`max`, `problem`…). */
  details: Record<string, unknown>;
};

export type ApiResult<T> = Result<T, ApiError>;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const NETWORK_ERROR: ApiError = {
  status: 0,
  code: "network",
  message: "Sem conexão com o servidor. Tentando de novo…",
  details: {},
};

/**
 * Chama uma rota da API com a sessão do navegador e lê o JSON. Nunca lança:
 * erro de rede, corpo inválido e status de erro viram `ApiError`.
 */
export async function requestJson<T>(fetchFn: FetchFn, url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetchFn(url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Corpo vazio ou não-JSON: decide pelo status.
  }

  if (response.ok) return { ok: true, value: body as T };

  const { error, message, ...details } = (body ?? {}) as Record<string, unknown>;
  return {
    ok: false,
    error: {
      status: response.status,
      code: typeof error === "string" ? error : `http_${response.status}`,
      message: typeof message === "string" ? message : `O servidor respondeu ${response.status}.`,
      details,
    },
  };
}

/** A sessão acabou (401) ou o Membro saiu da lista (403 `access_ended`): a página precisa sair dali. */
export function endedSession(error: ApiError): "anonymous" | "revoked" | null {
  if (error.status === 401) return "anonymous";
  if (error.status === 403 && error.code === "access_ended") return "revoked";
  return null;
}
