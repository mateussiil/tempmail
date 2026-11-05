// Entrada usada só pelo CLI do Better Auth para gerar o schema:
//   DATABASE_URL=postgres://x@localhost/x npx auth@latest generate \
//     --config auth.cli.ts --output src/shared/db/auth-schema.ts -y
// (o pool do pg é preguiçoso, então nenhum banco precisa estar no ar).
import { createAuth } from "./src/modules/membership/infrastructure/auth";

export const auth = createAuth();
