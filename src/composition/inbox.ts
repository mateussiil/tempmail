import { randomUUID } from "node:crypto";
import { CheckAddressUseCase } from "@/modules/inbox/application/CheckAddressUseCase";
import { CreateInboxUseCase } from "@/modules/inbox/application/CreateInboxUseCase";
import { DeleteInboxUseCase } from "@/modules/inbox/application/DeleteInboxUseCase";
import type { InboxDeps } from "@/modules/inbox/application/InboxDeps";
import { ListInboxesUseCase } from "@/modules/inbox/application/ListInboxesUseCase";
import { ReactivateInboxUseCase } from "@/modules/inbox/application/ReactivateInboxUseCase";
import { SetInboxKeptUseCase } from "@/modules/inbox/application/SetInboxKeptUseCase";
import { InboxPolicy } from "@/modules/inbox/domain/InboxPolicy";
import { DrizzleInboxRepository } from "@/modules/inbox/infrastructure/DrizzleInboxRepository";
import { generateRandomAddress } from "@/modules/inbox/infrastructure/randomAddress";
import { mailDomain, positiveIntEnv } from "@/shared/config/env";
import { getDb } from "@/shared/db/client";

/** Limite e prazo vêm do ambiente: MAX_ACTIVE_INBOXES_PER_MEMBER (20) e INBOX_TTL_HOURS (24). */
export function composeInboxUseCases() {
  const deps: InboxDeps = {
    repository: new DrizzleInboxRepository(getDb()),
    policy: new InboxPolicy(
      positiveIntEnv("MAX_ACTIVE_INBOXES_PER_MEMBER", 20),
      positiveIntEnv("INBOX_TTL_HOURS", 24),
    ),
    mailDomain: mailDomain(),
    clock: () => new Date(),
    newId: () => randomUUID(),
    randomAddress: () => generateRandomAddress(),
  };

  return {
    check: new CheckAddressUseCase(deps),
    create: new CreateInboxUseCase(deps),
    list: new ListInboxesUseCase(deps),
    setKept: new SetInboxKeptUseCase(deps),
    remove: new DeleteInboxUseCase(deps),
    reactivate: new ReactivateInboxUseCase(deps),
  };
}
