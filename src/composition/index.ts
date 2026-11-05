/**
 * Único lugar que liga as implementações reais aos casos de uso. Os pontos de
 * entrada (páginas e rotas) chamam estas funções; os testes montam os casos de
 * uso na mão, com repositórios falsos.
 */
import { GetHealthUseCase } from "@/modules/health/application/GetHealthUseCase";
import { PostgresHealthRepository } from "@/modules/health/infrastructure/PostgresHealthRepository";
import { getPool } from "@/shared/db/client";

export function composeGetHealth(): GetHealthUseCase {
  return new GetHealthUseCase(
    new PostgresHealthRepository({ query: (text) => getPool().query(text) }),
  );
}
