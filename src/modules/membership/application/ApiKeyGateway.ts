import type { ApiResult } from "@/shared/http/apiClient";
import type { ApiKeyView } from "./ApiKeyView";

/** As Chaves de API do Membro, pela API (só com a sessão do navegador). */
export interface ApiKeyGateway {
  list(): Promise<ApiResult<ApiKeyView[]>>;
  /** O `token` só existe nesta resposta. */
  create(name: string): Promise<ApiResult<{ key: ApiKeyView; token: string }>>;
  revoke(keyId: string): Promise<ApiResult<{ revoked: true }>>;
}
