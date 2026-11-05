import { connection } from "next/server";
import { InboxWorkspaceEntry } from "@/app/_components/InboxWorkspaceEntry";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { requireMember } from "@/composition/membership";
import { mailDomain, missingAuthEnv, positiveIntEnv } from "@/shared/config/env";
import { AppHeader } from "@/modules/membership/ui/AppHeader";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page() {
  // Depende da sessão e das variáveis de ambiente: nunca pré-renderizar.
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const member = await requireMember();

  return (
    <div className="app">
      <AppHeader githubUsername={member.githubUsername} current="inboxes" actions={<SignOutButton />} />
      <InboxWorkspaceEntry mailDomain={mailDomain()} ttlHours={positiveIntEnv("INBOX_TTL_HOURS", 24)} />
    </div>
  );
}
