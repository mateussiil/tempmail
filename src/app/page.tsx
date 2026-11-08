import { connection } from "next/server";
import { InboxesHomeEntry } from "@/app/_components/InboxesHomeEntry";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { requireMember } from "@/composition/membership";
import { shellData } from "@/composition/shell";
import { mailDomain, missingAuthEnv, positiveIntEnv } from "@/shared/config/env";
import { AppShell } from "@/modules/membership/ui/AppShell";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page() {
  // Depende da sessão e das variáveis de ambiente: nunca pré-renderizar.
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const shell = await shellData(await requireMember());

  return (
    <AppShell {...shell} current="inboxes" signOut={<SignOutButton />}>
      <InboxesHomeEntry mailDomain={mailDomain()} ttlHours={positiveIntEnv("INBOX_TTL_HOURS", 24)} />
    </AppShell>
  );
}
