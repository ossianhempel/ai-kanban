import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiPort = env.PORT || "3002";
  const webPort = Number(env.WEB_DEV_PORT || 5175);

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
        "/mcp": `http://localhost:${apiPort}`,
        "/health": `http://localhost:${apiPort}`,
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
