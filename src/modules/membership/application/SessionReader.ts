export type SessionUser = {
  id: string;
  /** Username do GitHub gravado na criação do Membro; `null` se faltar. */
  githubUsername: string | null;
  name: string;
  image: string | null;
};

export interface SessionReader {
  /** O usuário da sessão atual, ou `null` se não há sessão válida. */
  readSessionUser(): Promise<SessionUser | null>;
}
