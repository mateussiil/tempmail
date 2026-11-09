import { redirect } from "next/navigation";
import { connection } from "next/server";
import { InboxesHomeEntry } from "@/app/_components/InboxesHomeEntry";
import { SignInWithGithubButton } from "@/app/_components/SignInWithGithubButton";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { composeGetCurrentMember } from "@/composition/membership";
import { shellData } from "@/composition/shell";
import { mailDomain, missingAuthEnv, positiveIntEnv } from "@/shared/config/env";
import { AppShell } from "@/modules/membership/ui/AppShell";
import { LandingPage } from "@/modules/membership/ui/LandingPage";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page() {
  // Depende da sessão e das variáveis de ambiente: nunca pré-renderizar.
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const ttlHours = positiveIntEnv("INBOX_TTL_HOURS", 24);
  const current = await composeGetCurrentMember().execute();
  if (current.status === "revoked") redirect("/acesso-encerrado");

  // Quem ainda não entrou conhece o produto aqui mesmo, com o botão de entrar.
  if (current.status === "anonymous") {
    return (
      <LandingPage
        mailDomain={mailDomain()}
        ttlHours={ttlHours}
        maxActiveInboxes={positiveIntEnv("MAX_ACTIVE_INBOXES_PER_MEMBER", 20)}
        mcpUrl={`${(process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")}/api/mcp`}
        signInButton={<SignInWithGithubButton />}
      />
    );
  }

  const shell = await shellData(current.member);

  return (
    <AppShell {...shell} current="inboxes" signOut={<SignOutButton />}>
      <InboxesHomeEntry mailDomain={mailDomain()} ttlHours={ttlHours} />
    </AppShell>
  );
}
