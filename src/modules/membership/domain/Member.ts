/** Pessoa do time autorizada a usar o sistema (ver `CONTEXT.md`). */
export class Member {
  constructor(
    readonly id: string,
    readonly githubUsername: string,
    readonly name: string,
    readonly image: string | null,
  ) {}
}
