import { fail, ok, type Result } from "@/shared/result";
import { ApiKey } from "../domain/ApiKey";
import { apiKeyPrefix, generateApiKeyToken, hashApiKeyToken } from "../domain/apiKeyToken";
import type { ApiKeyRepository } from "./ApiKeyRepository";
import { toApiKeyView, type ApiKeyView } from "./ApiKeyView";

export const MAX_API_KEY_NAME_LENGTH = 60;

export type ApiKeyError = { code: "invalid_name" } | { code: "not_found" };

type Deps = {
  repository: ApiKeyRepository;
  clock: () => Date;
  newId: () => string;
  /** Troca de lugar nos testes. */
  generateToken?: () => string;
};

/** Cria uma chave. O segredo (`token`) só existe nesta resposta: depois fica só o hash. */
export class CreateApiKeyUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: {
    memberId: string;
    name: string;
  }): Promise<Result<{ key: ApiKeyView; token: string }, ApiKeyError>> {
    const name = input.name.trim();
    if (name === "" || name.length > MAX_API_KEY_NAME_LENGTH) return fail({ code: "invalid_name" });

    const token = (this.deps.generateToken ?? generateApiKeyToken)();
    const key = new ApiKey(
      this.deps.newId(),
      input.memberId,
      name,
      apiKeyPrefix(token),
      this.deps.clock(),
      null,
      null,
    );
    await this.deps.repository.insert(key, hashApiKeyToken(token));

    return ok({ key: toApiKeyView(key), token });
  }
}

/** As chaves do Membro, ativas e revogadas, da mais nova para a mais antiga. */
export class ListApiKeysUseCase {
  constructor(private readonly deps: Pick<Deps, "repository">) {}

  async execute(input: { memberId: string }): Promise<ApiKeyView[]> {
    const keys = await this.deps.repository.listByMember(input.memberId);
    return keys
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(toApiKeyView);
  }
}

export class RevokeApiKeyUseCase {
  constructor(private readonly deps: Pick<Deps, "repository" | "clock">) {}

  async execute(input: { memberId: string; keyId: string }): Promise<Result<null, ApiKeyError>> {
    const found = await this.deps.repository.revoke(input.keyId, input.memberId, this.deps.clock());
    return found ? ok(null) : fail({ code: "not_found" });
  }
}
