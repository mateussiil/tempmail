import type { Member } from "@/modules/membership/domain/Member";
import { composeInboxUseCases } from "./inbox";

/** O que a casca das telas mostra: quem está logado e quantas Caixas ativas tem. */
export async function shellData(member: Member) {
  const inboxes = await composeInboxUseCases().list.execute({ ownerId: member.id });
  return {
    githubUsername: member.githubUsername,
    activeInboxes: inboxes.filter((inbox) => inbox.status === "active").length,
  };
}
