import { requestJson, type ApiResult, type FetchFn } from "@/shared/http/apiClient";
import type { ApiKeyGateway } from "../application/ApiKeyGateway";
import type { ApiKeyView } from "../application/ApiKeyView";

/** As Chaves de API pela rota `/api/keys`, com a sessão do navegador. */
export class HttpApiKeyGateway implements ApiKeyGateway {
  constructor(private readonly fetchFn: FetchFn) {}

  async list(): Promise<ApiResult<ApiKeyView[]>> {
    const result = await requestJson<{ keys: ApiKeyView[] }>(this.fetchFn, "/api/keys");
    return result.ok ? { ok: true, value: result.value.keys } : result;
  }

  create(name: string) {
    return requestJson<{ key: ApiKeyView; token: string }>(this.fetchFn, "/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  revoke(keyId: string) {
    return requestJson<{ revoked: true }>(this.fetchFn, `/api/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" });
  }
}
