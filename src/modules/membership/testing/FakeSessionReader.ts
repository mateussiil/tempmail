import type { SessionReader, SessionUser } from "../application/SessionReader";

export class FakeSessionReader implements SessionReader {
  constructor(private readonly user: SessionUser | null) {}

  async readSessionUser(): Promise<SessionUser | null> {
    return this.user;
  }
}
