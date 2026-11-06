import { eq } from "drizzle-orm";
import type { Db } from "@/shared/db/client";
import { user } from "@/shared/db/auth-schema";
import type { MemberDirectory } from "../application/MemberDirectory";

export class DrizzleMemberDirectory implements MemberDirectory {
  constructor(private readonly db: Db) {}

  async listMembers(): Promise<{ id: string; githubUsername: string | null }[]> {
    return this.db.select({ id: user.id, githubUsername: user.githubUsername }).from(user);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({ id: user.id, githubUsername: user.githubUsername, name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  }
}
