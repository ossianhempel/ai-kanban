import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type UpdateOptions = {
  installDir?: string;
  branch?: string;
  composeProd?: string;
  dev?: boolean;
};

function run(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: env ?? process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

export function resolveInstallDir(explicit?: string): string {
  if (explicit) {
    return resolve(explicit);
  }

  if (process.env.AIKANBAN_INSTALL_DIR) {
    return resolve(process.env.AIKANBAN_INSTALL_DIR);
  }

  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, ".git")) && existsSync(join(dir, "docker-compose.yml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  throw new Error(
    "Could not find installation root (.git + docker-compose.yml). Run from your clone or set AIKANBAN_INSTALL_DIR.",
  );
}

export async function updateInstallation(options: UpdateOptions = {}) {
  const installDir = resolveInstallDir(options.installDir);
  const branch = options.branch ?? process.env.AIKANBAN_UPDATE_BRANCH ?? "main";
  const composeProd = options.composeProd ?? process.env.AIKANBAN_COMPOSE_PROD ?? "docker-compose.prod.yml";

  if (!existsSync(join(installDir, ".env"))) {
    throw new Error(`Missing .env in ${installDir}. Create it before updating.`);
  }

  console.log(`Updating installation at ${installDir} (branch: ${branch})`);

  if (options.dev) {
    run("git", ["fetch", "origin", branch], installDir);
    run("git", ["pull", "--ff-only", "origin", branch], installDir);
    run("pnpm", ["install"], installDir);
    run("pnpm", ["db:migrate"], installDir);
    console.log("Done. Restart your dev server (pnpm dev) if it is running.");
    return { installDir, mode: "dev" as const, branch };
  }

  const scriptPath = join(installDir, "scripts/update-installation.sh");
  if (!existsSync(scriptPath)) {
    throw new Error(`Missing ${scriptPath}. Pull the latest ai-kanban source and try again.`);
  }

  run("bash", [scriptPath], installDir, {
    ...process.env,
    AIKANBAN_INSTALL_DIR: installDir,
    AIKANBAN_UPDATE_BRANCH: branch,
    AIKANBAN_COMPOSE_PROD: composeProd,
  });

  return { installDir, mode: "docker" as const, branch };
}
