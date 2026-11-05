// Roda uma vez quando o servidor sobe, antes de aceitar pedidos.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
