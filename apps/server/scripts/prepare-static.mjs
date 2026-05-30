import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = resolve(root, "../web/dist");
const staticDir = resolve(root, "static");

if (!existsSync(webDist)) {
  console.error("Web build not found. Run pnpm --filter @ai-kanban/web build first.");
  process.exit(1);
}

rmSync(staticDir, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });
cpSync(webDist, staticDir, { recursive: true });
console.log(`Copied web assets to ${staticDir}`);
