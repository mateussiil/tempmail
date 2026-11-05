import type { ApiKey } from "../domain/ApiKey";
import type { SessionUser } from "./SessionReader";

export interface ApiKeyRepository {
  insert(key: ApiKey, keyHash: string): Promise<void>;
  /** A chave com esse hash e o Membro dono dela, ou `null`. Inclui revogadas. */
  findByHash(keyHash: string): Promise<{ key: ApiKey; owner: SessionUser } | null>;
  listByMember(memberId: string): Promise<ApiKey[]>;
  /** Revoga a chave do Membro. `false` se não existe ou é de outro; repetir não muda nada. */
  revoke(id: string, memberId: string, at: Date): Promise<boolean>;
  touchLastUsed(id: string, at: Date): Promise<void>;
}
