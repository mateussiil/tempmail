/** Os Membros já criados, com o username do GitHub gravado na criação. */
export interface MemberDirectory {
  listMembers(): Promise<{ id: string; githubUsername: string | null }[]>;
  findById(id: string): Promise<{ id: string; githubUsername: string | null; name: string; image: string | null } | null>;
}
