import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const json = (o: unknown) => JSON.stringify(o, null, 2);

test("skips without agent config, scripts or workflows", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("passes for narrow rules, pinned servers and https", async () => {
  const files = {
    ".claude/settings.json": json({ permissions: { allow: ["Bash(npm test)", "Bash(git status:*)", "Read"], defaultMode: "acceptEdits" } }),
    ".mcp.json": json({
      mcpServers: {
        gh: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github@2025.4.8"] },
        time: { command: "uvx", args: ["mcp-server-time==0.6.2"] },
        local: { url: "http://localhost:3000/mcp" },
        remote: { type: "http", url: "https://mcp.example.com/mcp" },
        files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@2025.8.21", "./docs"] },
      },
    }),
    "package.json": json({ scripts: { test: "node --test", fix: "claude -p 'fix lint'" } }),
    ".github/workflows/ci.yml": "jobs:\n  a:\n    steps:\n      - run: npm test -- --yolo-mode-of-another-tool\n",
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "pass", JSON.stringify(result.raw.details));
});

test("warns on blanket Claude Code permissions", async () => {
  const files = {
    ".claude/settings.json": json({ permissions: { allow: ["Bash", "Bash(*)", "Edit"], defaultMode: "bypassPermissions" }, enableAllProjectMcpServers: true }),
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["allow_all", "allow_all", "bypass_mode", "all_mcp_servers"]);
});

test("warns on unpinned, plain http and whole-disk MCP servers, also in JSON with comments", async () => {
  const vscode = [
    "{",
    "  // MCP servers for this workspace",
    '  "servers": {',
    '    "fetch": { "command": "npx", "args": ["-y", "@some/mcp-server"] },',
    '    "py": { "command": "uvx", "args": ["mcp-server-fetch"] },',
    '    "dlx": { "command": "pnpm", "args": ["dlx", "mcp-tool@latest"] },',
    '    "api": { "url": "http://mcp.example.com/sse" },',
    '    "disk": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem@2025.8.21", "/"] },',
    "  },",
    "}",
  ].join("\n");
  const result = await runRepoCheck(here, { ".vscode/mcp.json": vscode });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [
    ["unpinned", 4],
    ["unpinned", 5],
    ["unpinned", 6],
    ["http", 7],
    ["filesystem_root", 8],
  ]);
});

test("warns on approval-skipping flags in workflows and scripts, and on unsafe Codex settings", async () => {
  const files = {
    ".github/workflows/agent.yml": "jobs:\n  a:\n    steps:\n      - run: claude -p \"triage\" --dangerously-skip-permissions\n      - run: gemini --yolo -p hi\n",
    "scripts/agent.sh": "codex exec --dangerously-bypass-approvals-and-sandbox 'fix'\n",
    ".codex/config.toml": 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n',
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.key]).sort(), [
    [".codex/config.toml", "codex_unsafe"],
    [".github/workflows/agent.yml", "skip_flag"],
    [".github/workflows/agent.yml", "skip_flag"],
    ["scripts/agent.sh", "skip_flag"],
  ]);
});

test("ignores --yolo without an agent on the line", async () => {
  assert.equal((await runRepoCheck(here, { "scripts/x.sh": "deploy --yolo\n" })).status, "pass");
});
