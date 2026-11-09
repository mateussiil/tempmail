import type { ApiResult } from "@/shared/http/apiClient";
import type { AddressAvailability } from "./CheckAddressUseCase";
import type { InboxView } from "./InboxView";
import type { MascotId } from "../domain/Mascot";

/**
 * O que a página precisa das Caixas, pela API. Os casos de uso rodam no
 * servidor, atrás das rotas; no navegador, este é o repositório.
 */
export interface InboxGateway {
  list(): Promise<ApiResult<InboxView[]>>;
  /** Sem `address`, aleatória. Criar um endereço seu expirado reativa (`reactivated: true`). */
  create(input: { address?: string; mascot?: MascotId }): Promise<ApiResult<{ inbox: InboxView; reactivated: boolean }>>;
  setMascot(inboxId: string, mascot: MascotId): Promise<ApiResult<InboxView>>;
  setKept(inboxId: string, kept: boolean): Promise<ApiResult<InboxView>>;
  remove(inboxId: string): Promise<ApiResult<InboxView>>;
  reactivate(inboxId: string, keep: boolean): Promise<ApiResult<InboxView>>;
  checkAvailability(address: string): Promise<ApiResult<AddressAvailability>>;
}
