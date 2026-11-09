import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const mcp = (env: Record<string, string>, args: string[] = []) =>
  JSON.stringify({ mcpServers: { github: { command: "npx", args: ["@modelcontextprotocol/server-github@1.0.0", ...args], env } } }, null, 2);

test("skips without agent files", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("passes for env references and placeholders", async () => {
  const files = {
    ".mcp.json": mcp({ GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}", API_KEY: "<your-api-key>", OTHER_TOKEN: "sk-xxxxxxxxxxxxxxxxxxxx" }),
    ".vscode/mcp.json": JSON.stringify({ servers: { s: { url: "https://x.example/mcp", headers: { Authorization: "Bearer ${input:token}" } } } }),
    "CLAUDE.md": "# Rules\nThe token_type is bearer. Set API_KEY in your shell, never here.\nmax_tokens: 4096\n",
    // A documentation example as seen in public skill files: a known format, but a counting sequence.
    ".claude/skills/review/SKILL.md": `Bad: API_KEY = "sk_${"live_"}1234567890abcdefghij"\n`,
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "pass", JSON.stringify(result.raw.details));
});

test("fails on a literal token in an MCP env block, without showing it", async () => {
  const value = "a8F3kQ9zL2mX7vB4nR6tY1wE5uI0oP3s";
  const result = await runRepoCheck(here, { ".cursor/mcp.json": mcp({ BRAVE_API_KEY: value }) });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line, d.params?.name]), [["literal", 9, "BRAVE_API_KEY"]]);
  assert.ok(!JSON.stringify(result.raw).includes(value.slice(0, 4)));
});

test("fails on camelCase keys, bearer headers and --api-key arguments", async () => {
  const files = {
    ".claude/settings.json": JSON.stringify({ env: { apiKey: "Zq81LmN0pW7xR2cV9bT4yH6u" } }, null, 2),
    ".vscode/mcp.json": JSON.stringify({ servers: { s: { headers: { Authorization: "Bearer 9fK2mQ7xL4pZ8vN1cR6tW3yB" } } } }, null, 2),
    ".mcp.json": mcp({}, ["--api-key", "Hq3Lx9Pz2Mv7Nc4Rb8Tw1Ys6"]),
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => d.key).sort(), ["flag", "literal", "literal"]);
});

test("fails on a known key format in an instruction file", async () => {
  const result = await runRepoCheck(here, { "AGENTS.md": `Use this key: ${["ghp", "Zq7Lm2Xv9Rt4Kp8Wn3Yb6Hd1Fs5Gj0Ac8Ue2"].join("_")}\n` });
  assert.equal(result.status, "fail");
  assert.equal(result.raw.details?.[0].params?.name, "GitHub token");
});

test("ignores fixtures", async () => {
  const files = { "test/fixtures/.mcp.json": mcp({ API_KEY: "a8F3kQ9zL2mX7vB4nR6tY1wE" }), "CLAUDE.md": "x" };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("warns for a key that may be meant to be public", async () => {
  const google = ["AIza", "Sy7Lm2Xv9Rt4Kp8Wn3Yb6Hd1Fs5Gj0Ac8Ue"].join("");
  const result = await runRepoCheck(here, { "CLAUDE.md": `Maps key: ${google}\n` });
  assert.equal(result.status, "warn");
});
