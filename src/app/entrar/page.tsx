import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignInWithGithubButton } from "@/app/_components/SignInWithGithubButton";
import { composeGetCurrentMember } from "@/composition/membership";
import { missingAuthEnv } from "@/shared/config/env";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";
import { SignInPage } from "@/modules/membership/ui/SignInPage";

const ERROR_MESSAGE =
  "Não foi possível entrar. Se o seu usuário do GitHub não está na lista do time, peça acesso a quem administra o tempmail.";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const current = await composeGetCurrentMember().execute();
  if (current.status === "member") redirect("/");
  if (current.status === "revoked") redirect("/acesso-encerrado");

  const { error } = await searchParams;

  return (
    <SignInPage
      errorMessage={error ? ERROR_MESSAGE : undefined}
      signInButton={<SignInWithGithubButton />}
    />
  );
}
