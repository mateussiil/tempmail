import { connection } from "next/server";
import { ApiKeysEntry } from "@/app/_components/ApiKeysEntry";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { requireMember } from "@/composition/membership";
import { missingAuthEnv } from "@/shared/config/env";
import { shellData } from "@/composition/shell";
import { AppShell } from "@/modules/membership/ui/AppShell";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export const metadata = { title: "Chaves de API · tempmail" };

export default async function Page() {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const shell = await shellData(await requireMember());
  const mcpUrl = `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")}/api/mcp`;

  return (
    <AppShell {...shell} current="keys" signOut={<SignOutButton />}>
      <ApiKeysEntry mcpUrl={mcpUrl} />
    </AppShell>
  );
}
