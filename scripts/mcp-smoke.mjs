#!/usr/bin/env node
/**
 * Smoke-test a remote AI Kanban MCP endpoint (e.g. Coolify deployment).
 *
 * Usage:
 *   AIKANBAN_MCP_URL=http://ai-kanban.65.108.88.160.sslip.io/mcp node scripts/mcp-smoke.mjs
 *   AIKANBAN_API_TOKEN=... AIKANBAN_MCP_URL=... node scripts/mcp-smoke.mjs --call list
 */

const mcpUrl = process.env.AIKANBAN_MCP_URL ?? "http://localhost:3000/mcp";
const apiToken = process.env.AIKANBAN_API_TOKEN;
const shouldCall = process.argv.includes("--call");

async function mcpRequest(method, params, id) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text);
}

function printStep(label, payload) {
  process.stdout.write(`\n## ${label}\n`);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  process.stdout.write(`MCP URL: ${mcpUrl}\n`);
  process.stdout.write(`Auth: ${apiToken ? "Bearer token set" : "none"}\n`);

  const initialized = await mcpRequest(
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-smoke", version: "1.0.0" },
    },
    1,
  );
  printStep("initialize", initialized);

  const tools = await mcpRequest("tools/list", {}, 2);
  printStep("tools/list", tools);

  if (shouldCall) {
    const listed = await mcpRequest(
      "tools/call",
      {
        name: "aikanban_list_tasks",
        arguments: { status: "agent_ready" },
      },
      3,
    );
    printStep("tools/call aikanban_list_tasks", listed);
  }

  process.stdout.write("\nOK — MCP endpoint is reachable.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
