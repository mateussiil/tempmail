import { connection } from "next/server";
import { InboxScreenEntry } from "@/app/_components/InboxScreenEntry";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { requireMember } from "@/composition/membership";
import { shellData } from "@/composition/shell";
import { missingAuthEnv, positiveIntEnv } from "@/shared/config/env";
import { AppShell } from "@/modules/membership/ui/AppShell";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const shell = await shellData(await requireMember());
  const { id } = await params;

  return (
    <AppShell {...shell} current="inboxes" signOut={<SignOutButton />}>
      <InboxScreenEntry inboxId={id} ttlHours={positiveIntEnv("INBOX_TTL_HOURS", 24)} />
    </AppShell>
  );
}
