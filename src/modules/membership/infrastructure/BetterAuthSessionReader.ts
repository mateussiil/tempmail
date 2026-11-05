import type { SessionReader, SessionUser } from "../application/SessionReader";
import type { Auth } from "./auth";

export class BetterAuthSessionReader implements SessionReader {
  constructor(
    private readonly auth: () => Auth,
    private readonly requestHeaders: () => Promise<Headers>,
  ) {}

  async readSessionUser(): Promise<SessionUser | null> {
    const session = await this.auth().api.getSession({ headers: await this.requestHeaders() });
    if (!session) return null;

    const user = session.user as {
      id: string;
      name: string;
      image?: string | null;
      githubUsername?: string | null;
    };

    return {
      id: user.id,
      githubUsername: user.githubUsername ?? null,
      name: user.name,
      image: user.image ?? null,
    };
  }
}
