import { connection } from "next/server";
import { composeGetHealth } from "@/composition";
import { HomePage } from "@/modules/health/ui/HomePage";

export default async function Page() {
  // Lê o banco a cada pedido: nunca pré-renderizar no build.
  await connection();
  const status = await composeGetHealth().execute();

  return <HomePage databaseUp={status.healthy} />;
}
