import type { Db } from "@/shared/db/client";
import { user } from "@/shared/db/auth-schema";
import type { MemberDirectory } from "../application/MemberDirectory";

export class DrizzleMemberDirectory implements MemberDirectory {
  constructor(private readonly db: Db) {}

  async listMembers(): Promise<{ id: string; githubUsername: string | null }[]> {
    return this.db.select({ id: user.id, githubUsername: user.githubUsername }).from(user);
  }
}
