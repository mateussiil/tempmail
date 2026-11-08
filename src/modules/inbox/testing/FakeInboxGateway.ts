import type { ApiError, ApiResult } from "@/shared/http/apiClient";
import { CheckAddressUseCase } from "../application/CheckAddressUseCase";
import { CreateInboxUseCase } from "../application/CreateInboxUseCase";
import { DeleteInboxUseCase } from "../application/DeleteInboxUseCase";
import { describeInboxError, type InboxError } from "../application/InboxError";
import type { InboxGateway } from "../application/InboxGateway";
import { ListInboxesUseCase } from "../application/ListInboxesUseCase";
import { ReactivateInboxUseCase } from "../application/ReactivateInboxUseCase";
import { SetInboxKeptUseCase } from "../application/SetInboxKeptUseCase";
import { SetInboxMascotUseCase } from "../application/SetInboxMascotUseCase";
import type { MascotId } from "../domain/Mascot";
import type { Result } from "@/shared/result";
import { makeInboxDeps } from "./inboxTestDeps";

const STATUS: Record<InboxError["code"], number> = {
  invalid_address: 400,
  address_taken: 409,
  already_active: 409,
  limit_reached: 409,
  not_found: 404,
  not_active: 409,
  not_expired: 409,
};

function toApi<T>(result: Result<T, InboxError>): ApiResult<T> {
  if (result.ok) return result;
  const { code, ...details } = result.error;
  return { ok: false, error: { status: STATUS[code], code, message: describeInboxError(result.error), details } };
}

/**
 * O gateway das Caixas em memória, sobre os casos de uso reais e o repositório
 * falso: os testes de tela passam pelas mesmas regras do servidor.
 */
export class FakeInboxGateway implements InboxGateway {
  readonly test = makeInboxDeps();
  /** Quando definido, toda chamada falha com este erro (rede caída, sessão acabada…). */
  failWith: ApiError | null = null;
  calls: string[] = [];

  constructor(private readonly ownerId = "ana") {}

  private failure(name: string): ApiResult<never> | null {
    this.calls.push(name);
    return this.failWith ? { ok: false, error: this.failWith } : null;
  }

  async list() {
    return this.failure("list") ?? { ok: true as const, value: await new ListInboxesUseCase(this.test.deps).execute({ ownerId: this.ownerId }) };
  }

  async setMascot(inboxId: string, mascot: MascotId) {
    return this.failure("setMascot") ?? toApi(await new SetInboxMascotUseCase(this.test.deps).execute({ ownerId: this.ownerId, inboxId, mascot }));
  }

  async create(input: { address?: string; mascot?: MascotId }) {
    return this.failure("create") ?? toApi(await new CreateInboxUseCase(this.test.deps).execute({ ownerId: this.ownerId, ...input }));
  }

  async setKept(inboxId: string, kept: boolean) {
    return this.failure("setKept") ?? toApi(await new SetInboxKeptUseCase(this.test.deps).execute({ ownerId: this.ownerId, inboxId, kept }));
  }

  async remove(inboxId: string) {
    return this.failure("remove") ?? toApi(await new DeleteInboxUseCase(this.test.deps).execute({ ownerId: this.ownerId, inboxId }));
  }

  async reactivate(inboxId: string, keep: boolean) {
    return this.failure("reactivate") ?? toApi(await new ReactivateInboxUseCase(this.test.deps).execute({ ownerId: this.ownerId, inboxId, keep }));
  }

  async checkAvailability(address: string) {
    return this.failure("checkAvailability") ?? { ok: true as const, value: await new CheckAddressUseCase(this.test.deps).execute({ ownerId: this.ownerId, address }) };
  }

  /** Cria uma Caixa de outro Membro (pra testar "pertence a outro membro"). */
  async seedForOtherMember(address: string, ownerId = "bruno") {
    const result = await new CreateInboxUseCase(this.test.deps).execute({ ownerId, address });
    if (!result.ok) throw new Error(`seedForOtherMember: ${result.error.code}`);
    return result.value.inbox;
  }
}
