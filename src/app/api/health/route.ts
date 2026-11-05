import { composeGetHealth } from "@/composition";

export async function GET() {
  const status = await composeGetHealth().execute();

  return Response.json(
    {
      status: status.healthy ? "ok" : "degraded",
      database: status.database,
      checkedAt: status.checkedAt.toISOString(),
    },
    {
      status: status.healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
