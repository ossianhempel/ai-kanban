import { access } from "node:fs/promises";
import { join } from "node:path";
import simpleGit from "simple-git";

export * from "./providers/types.js";
export * from "./providers/registry.js";
export * from "./webhooks/github.js";
export * from "./webhooks/azure-devops.js";
export type { NormalizedPullRequestEvent } from "./webhooks/azure-devops.js";

export type RepositoryScanInput = {
  localPath: string;
  name: string;
};

export type RepositoryScanResult = {
  score: number;
  recommendations: string[];
  checks: Record<string, boolean>;
};

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scanRepository(input: RepositoryScanInput): Promise<RepositoryScanResult> {
  const checks: Record<string, boolean> = {
    readme: await pathExists(join(input.localPath, "README.md")),
    claudeMd: await pathExists(join(input.localPath, "CLAUDE.md")),
    agentsMd: await pathExists(join(input.localPath, "AGENTS.md")),
    contributing: await pathExists(join(input.localPath, "CONTRIBUTING.md")),
    packageJson: await pathExists(join(input.localPath, "package.json")),
    gitRepo: false,
    ciConfig: false,
    testSetup: false,
  };

  checks.gitRepo = await pathExists(join(input.localPath, ".git"));

  checks.ciConfig =
    (await pathExists(join(input.localPath, ".github/workflows"))) ||
    (await pathExists(join(input.localPath, ".gitlab-ci.yml")));

  checks.testSetup =
    (await pathExists(join(input.localPath, "vitest.config.ts"))) ||
    (await pathExists(join(input.localPath, "jest.config.js"))) ||
    (await pathExists(join(input.localPath, "playwright.config.ts")));

  if (checks.gitRepo) {
    try {
      const git = simpleGit(input.localPath);
      await git.status();
    } catch {
      checks.gitRepo = false;
    }
  }

  const recommendations: string[] = [];
  if (!checks.readme) recommendations.push("Add a README.md with setup and usage instructions.");
  if (!checks.claudeMd && !checks.agentsMd) recommendations.push("Add CLAUDE.md or AGENTS.md for agent guidance.");
  if (!checks.contributing) recommendations.push("Add CONTRIBUTING.md with contribution guidelines.");
  if (!checks.ciConfig) recommendations.push("Configure CI workflows for tests and lint.");
  if (!checks.testSetup) recommendations.push("Add a test runner configuration.");

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 100);

  return { score, recommendations, checks };
}

export async function readRepositoryAgentGuide(localPath: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const content = await readFile(join(localPath, filename), "utf8");
      if (content.trim()) {
        return content.trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}

export const knowledgeIntegrations = {
  notion: { enabled: false },
  obsidian: { enabled: false },
  confluence: { enabled: false },
  sharepoint: { enabled: false },
};
