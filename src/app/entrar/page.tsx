import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignInWithGithubButton } from "@/app/_components/SignInWithGithubButton";
import { composeGetCurrentMember } from "@/composition/membership";
import { NOT_ON_ALLOWLIST_CODE } from "@/modules/membership/infrastructure/auth";
import { accessRequestEmail, missingAuthEnv } from "@/shared/config/env";
import { AccessDeniedPage } from "@/modules/membership/ui/AccessDeniedPage";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";
import { SignInPage } from "@/modules/membership/ui/SignInPage";

const ERROR_MESSAGE =
  "Não foi possível entrar. Se o seu usuário do GitHub não está na lista do time, peça acesso a quem administra o tempmail.";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sig?: string }>;
}) {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const { error, sig } = await searchParams;
  // `sig` = um pedido OAuth assinado (o conector do claude.ai). Nesse caso a
  // página mostra o botão mesmo com sessão: o Better Auth mandou entrar de
  // novo, e o login continua o pedido sozinho.
  const oauthRequest = Boolean(sig);

  const current = await composeGetCurrentMember().execute();
  if (current.status === "member" && !oauthRequest) redirect("/");
  if (current.status === "revoked") redirect("/acesso-encerrado");

  if (error === NOT_ON_ALLOWLIST_CODE) {
    return <AccessDeniedPage requestEmail={accessRequestEmail()} />;
  }

  return (
    <SignInPage
      errorMessage={error ? ERROR_MESSAGE : undefined}
      signInButton={<SignInWithGithubButton />}
    />
  );
}
