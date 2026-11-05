import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker enxuta: .next/standalone traz só o que o servidor precisa.
  output: "standalone",
};

export default nextConfig;
