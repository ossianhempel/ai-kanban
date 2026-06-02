import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type AgentIntegrationInfo, type McpPublicConfig } from "@/lib/api";

function configJson(config: McpPublicConfig, client: "cursor" | "claudeDesktop") {
  return JSON.stringify(config.clients[client], null, 2);
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function AgentIntegrationCard() {
  const [integration, setIntegration] = useState<AgentIntegrationInfo | null>(null);
  const [publicConfig, setPublicConfig] = useState<McpPublicConfig | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void api.getMcpConfig().then(({ config }) => setPublicConfig(config)).catch(() => setPublicConfig(null));
    void api.getAgentIntegration().then(setIntegration).catch(() => setIntegration(null));
  }, []);

  const config = publicConfig;
  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent integration (MCP)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
            Could not load MCP install config from this server.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isAdmin = integration?.isAdmin ?? false;

  async function handleCopy(label: string, text: string) {
    await copyText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent integration (MCP)</CardTitle>
        <CardDescription>
          Install this hosted MCP in Cursor or Claude Desktop — no local server required. Point your client at this
          instance and call tools like <code className="text-[length:var(--text-xs)]">aikanban_list_tasks</code>.{" "}
          <a
            href="/docs/agent-loop"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-text-strong)] underline-offset-2 hover:underline"
          >
            Agent loop guide
          </a>
          {" "}
          (list → review → claim or clarify).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">MCP endpoint</p>
          <code className="block break-all rounded-md bg-[var(--color-bg-selected)] px-3 py-2 text-[length:var(--text-sm)]">
            {config.mcpUrl}
          </code>
        </div>

        <div className="space-y-1">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Available tools</p>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{config.tools.join(", ")}</p>
        </div>

        <div className="space-y-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Multiple projects</p>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{config.multiProject.hint}</p>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            Workflow: {config.multiProject.workflow.join(" → ")}
          </p>
        </div>

        <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
          {config.auth.configured
            ? "AIKANBAN_API_TOKEN is set on the server — replace YOUR_AIKANBAN_API_TOKEN in the config below."
            : "No API token is configured yet. MCP works for read/list on this instance; set AIKANBAN_API_TOKEN in Coolify for authenticated agent writes."}
        </p>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Claude Desktop</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleCopy("claude", configJson(config, "claudeDesktop"))}
            >
              {copied === "claude" ? "Copied" : "Copy config"}
            </Button>
          </div>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            Paste into{" "}
            <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{" "}
            under <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">mcpServers</code>, then restart
            Claude Desktop.
          </p>
          <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-[length:var(--text-xs)] leading-relaxed">
            {configJson(config, "claudeDesktop")}
          </pre>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Cursor</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleCopy("cursor", configJson(config, "cursor"))}
            >
              {copied === "cursor" ? "Copied" : "Copy config"}
            </Button>
          </div>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            Cursor Settings → MCP → add server, or paste into your project{" "}
            <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">.cursor/mcp.json</code>.
          </p>
          <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-[length:var(--text-xs)] leading-relaxed">
            {configJson(config, "cursor")}
          </pre>
        </div>

        {isAdmin ? (
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            Smoke test from your machine:{" "}
            <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">
              AIKANBAN_MCP_URL={config.mcpUrl} node scripts/mcp-smoke.mjs --call
            </code>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
