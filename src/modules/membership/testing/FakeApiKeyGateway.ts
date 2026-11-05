import type { ApiResult } from "@/shared/http/apiClient";
import type { ApiKeyGateway } from "../application/ApiKeyGateway";
import type { ApiKeyView } from "../application/ApiKeyView";

/** As chaves em memória. O segredo segue o formato `tm_…`, mas é previsível. */
export class FakeApiKeyGateway implements ApiKeyGateway {
  keys: ApiKeyView[] = [];
  private next = 1;

  async list(): Promise<ApiResult<ApiKeyView[]>> {
    return { ok: true, value: [...this.keys] };
  }

  async create(name: string) {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed.length > 60) {
      return { ok: false as const, error: { status: 400, code: "invalid_name", message: "Dê um nome de 1 a 60 caracteres.", details: {} } };
    }
    const n = this.next++;
    const key: ApiKeyView = {
      id: `k${n}`,
      name: trimmed,
      prefix: `tm_teste${n}0`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.keys.unshift(key);
    return { ok: true as const, value: { key, token: `tm_teste${n}0-segredo-de-teste` } };
  }

  async revoke(keyId: string) {
    this.keys = this.keys.map((k) => (k.id === keyId ? { ...k, revokedAt: new Date().toISOString() } : k));
    return { ok: true as const, value: { revoked: true as const } };
  }
}
