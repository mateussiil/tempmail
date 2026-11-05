"use client";

import { useState } from "react";
import { authClient } from "@/modules/membership/infrastructure/authClient";

export function SignInWithGithubButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    // Redireciona para o GitHub; só volta aqui se algo falhar antes disso.
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/",
      errorCallbackURL: "/entrar?error=auth",
    });
    if (result?.error) setPending(false);
  }

  return (
    <button type="button" className="button" onClick={signIn} disabled={pending}>
      {pending ? "Abrindo o GitHub…" : "Entrar com GitHub"}
    </button>
  );
}
