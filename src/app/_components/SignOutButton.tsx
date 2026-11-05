"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/modules/membership/infrastructure/authClient";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <button type="button" className="button button-quiet" onClick={signOut} disabled={pending}>
      Sair
    </button>
  );
}
