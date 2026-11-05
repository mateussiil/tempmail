import { requestJson, type ApiResult, type FetchFn } from "@/shared/http/apiClient";
import type { AddressAvailability } from "../application/CheckAddressUseCase";
import type { InboxGateway } from "../application/InboxGateway";
import type { InboxView } from "../application/InboxView";

function unwrap<T, K extends string>(result: ApiResult<Record<K, T>>, key: K): ApiResult<T> {
  return result.ok ? { ok: true, value: result.value[key] } : result;
}

const inboxUrl = (id: string) => `/api/inboxes/${encodeURIComponent(id)}`;

/** As Caixas pela API REST (`/api/inboxes`), com a sessão do navegador. */
export class HttpInboxGateway implements InboxGateway {
  constructor(private readonly fetchFn: FetchFn) {}

  async list(): Promise<ApiResult<InboxView[]>> {
    return unwrap(await requestJson<{ inboxes: InboxView[] }>(this.fetchFn, "/api/inboxes"), "inboxes");
  }

  create(input: { address?: string }) {
    return requestJson<{ inbox: InboxView; reactivated: boolean }>(this.fetchFn, "/api/inboxes", {
      method: "POST",
      body: JSON.stringify(input.address === undefined ? {} : { address: input.address }),
    });
  }

  async setKept(inboxId: string, kept: boolean): Promise<ApiResult<InboxView>> {
    const result = await requestJson<{ inbox: InboxView }>(this.fetchFn, inboxUrl(inboxId), {
      method: "PATCH",
      body: JSON.stringify({ kept }),
    });
    return unwrap(result, "inbox");
  }

  async remove(inboxId: string): Promise<ApiResult<InboxView>> {
    return unwrap(await requestJson<{ inbox: InboxView }>(this.fetchFn, inboxUrl(inboxId), { method: "DELETE" }), "inbox");
  }

  async reactivate(inboxId: string, keep: boolean): Promise<ApiResult<InboxView>> {
    const result = await requestJson<{ inbox: InboxView }>(this.fetchFn, `${inboxUrl(inboxId)}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ keep }),
    });
    return unwrap(result, "inbox");
  }

  checkAvailability(address: string): Promise<ApiResult<AddressAvailability>> {
    return requestJson<AddressAvailability>(
      this.fetchFn,
      `/api/inboxes/availability?address=${encodeURIComponent(address)}`,
    );
  }
}
