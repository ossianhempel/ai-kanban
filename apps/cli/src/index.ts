import { Command } from "commander";
import { ticketStatusSchema } from "@ai-kanban/agent-protocol";

const apiUrl = process.env.AIKANBAN_API_URL ?? "http://localhost:3000";
const apiToken = process.env.AIKANBAN_API_TOKEN;

type GlobalOptions = {
  json?: boolean;
  plain?: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function printOutput(payload: unknown, options: GlobalOptions) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (options.plain) {
    if (typeof payload === "string") {
      process.stdout.write(`${payload}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const program = new Command();

program
  .name("aikanban")
  .description("AI Kanban CLI for agent and terminal workflows")
  .version("0.1.0")
  .option("--json", "Emit machine-readable JSON")
  .option("--plain", "Emit compact plain output")
  .showHelpAfterError();

program
  .command("list")
  .description("List tickets")
  .option("--project <slug>", "Filter by project slug")
  .option("--status <status>", "Filter by ticket status")
  .action(async (flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const params = new URLSearchParams();
    if (flags.project) params.set("projectSlug", flags.project);
    if (flags.status) params.set("status", ticketStatusSchema.parse(flags.status));

    const query = params.toString();
    const payload = await request(`/api/tickets${query ? `?${query}` : ""}`);
    printOutput(payload, options);
  });

program
  .command("get-task")
  .description("Get full task context")
  .argument("<taskRef>", "Ticket id or key like AIK-123")
  .action(async (taskRef: string, _flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}`);
    printOutput(payload, options);
  });

program
  .command("claim")
  .description("Claim a ticket for agent execution")
  .argument("<taskRef>", "Ticket id or key")
  .option("--agent-id <id>", "Agent identifier", "cli-agent")
  .action(async (taskRef: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}/claim`, {
      method: "POST",
      body: JSON.stringify({ agentId: flags.agentId }),
    });
    printOutput(payload, options);
  });

program
  .command("update")
  .description("Update ticket status")
  .argument("<taskRef>", "Ticket id or key")
  .requiredOption("--status <status>", "New ticket status")
  .action(async (taskRef: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const status = ticketStatusSchema.parse(flags.status);
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    printOutput(payload, options);
  });

program
  .command("complete")
  .description("Mark a ticket as done")
  .argument("<taskRef>", "Ticket id or key")
  .option("--summary <text>", "Optional completion summary")
  .action(async (taskRef: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}/complete`, {
      method: "POST",
      body: JSON.stringify({ summary: flags.summary }),
    });
    printOutput(payload, options);
  });

program
  .command("link-pr")
  .description("Link an existing pull request to a ticket")
  .argument("<taskRef>", "Ticket id or key")
  .requiredOption("--url <url>", "Pull request URL")
  .option("--branch <branch>", "Branch name override")
  .action(async (taskRef: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}/link-pull-request`, {
      method: "POST",
      body: JSON.stringify({ url: flags.url, branchName: flags.branch }),
    });
    printOutput(payload, options);
  });

program
  .command("create-pr")
  .description("Create a pull request for a ticket")
  .argument("<taskRef>", "Ticket id or key")
  .requiredOption("--head <branch>", "Head branch with changes")
  .option("--title <title>", "Pull request title")
  .option("--body <text>", "Pull request body")
  .option("--base <branch>", "Target branch")
  .option("--draft", "Open as draft", false)
  .action(async (taskRef: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request(`/api/tickets/${encodeURIComponent(taskRef)}/create-pull-request`, {
      method: "POST",
      body: JSON.stringify({
        headBranch: flags.head,
        title: flags.title,
        body: flags.body,
        baseBranch: flags.base,
        draft: flags.draft ?? false,
      }),
    });
    printOutput(payload, options);
  });

program
  .command("repo-activity")
  .description("Get pull request activity for a connected repository")
  .argument("<repositoryId>", "Repository id")
  .option("--refresh", "Force refresh from provider", false)
  .action(async (repositoryId: string, flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const query = flags.refresh ? "?refresh=true" : "";
    const payload = await request(`/api/repositories/${encodeURIComponent(repositoryId)}/activity${query}`);
    printOutput(payload, options);
  });

program
  .command("connect")
  .description("Connect a source provider account")
  .requiredOption("--provider <provider>", "Provider id: github, azure_devops, gitlab")
  .requiredOption("--token <token>", "Personal access token")
  .option("--organization <org>", "Azure DevOps organization")
  .action(async (flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request("/api/connections", {
      method: "POST",
      body: JSON.stringify({
        provider: flags.provider,
        accessToken: flags.token,
        organization: flags.organization,
      }),
    });
    printOutput(payload, options);
  });

program
  .command("connections")
  .description("List connected provider accounts")
  .action(async (_flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request("/api/connections");
    printOutput(payload, options);
  });

program
  .command("doctor")
  .description("Check API connectivity")
  .action(async (_flags, command) => {
    const options = command.parent?.opts() as GlobalOptions;
    const payload = await request<{ ok: boolean }>("/health");
    printOutput({ ok: payload.ok, apiUrl }, options);
  });

await program.parseAsync(process.argv);
