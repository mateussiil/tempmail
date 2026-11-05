import { connection } from "next/server";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { requireMember } from "@/composition/membership";
import { missingAuthEnv } from "@/shared/config/env";
import { MemberHomePage } from "@/modules/membership/ui/MemberHomePage";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page() {
  // Depende da sessão e das variáveis de ambiente: nunca pré-renderizar.
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const member = await requireMember();

  return (
    <MemberHomePage
      name={member.name}
      githubUsername={member.githubUsername}
      actions={<SignOutButton />}
    />
  );
}
