import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { composeGetCurrentMember } from "@/composition/membership";
import { missingAuthEnv } from "@/shared/config/env";
import { AccessEndedPage } from "@/modules/membership/ui/AccessEndedPage";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";

export default async function Page() {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const current = await composeGetCurrentMember().execute();
  if (current.status === "anonymous") redirect("/entrar");
  if (current.status === "member") redirect("/");

  return <AccessEndedPage githubUsername={current.githubUsername} actions={<SignOutButton />} />;
}
