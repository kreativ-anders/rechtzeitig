import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const wf = (lines: string[]) => ({ ".github/workflows/agent.yml": lines.join("\n") });

test("skips without workflows", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("passes for workflows without agents", async () => {
  const result = await runRepoCheck(here, wf(["on: issues", "jobs:", "  a:", "    steps:", "      - run: echo hi"]));
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "no_agents");
});

test("passes for the interactive agent setup that checks write access itself", async () => {
  const result = await runRepoCheck(here, wf([
    "on:",
    "  issue_comment:",
    "    types: [created]",
    "jobs:",
    "  claude:",
    "    if: contains(github.event.comment.body, '@claude')",
    "    permissions:",
    "      contents: write",
    "    steps:",
    "      - uses: anthropics/claude-code-action@v1",
    "        with:",
    "          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}",
  ]));
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "none");
});

test("fails on issue text in the prompt of an agent with secrets", async () => {
  const result = await runRepoCheck(here, wf([
    "on:",
    "  issues:",
    "    types: [opened]",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  triage:",
    "    steps:",
    "      - uses: actions/ai-inference@v1",
    "        with:",
    "          token: ${{ secrets.GITHUB_TOKEN }}",
    "          prompt: |",
    "            Label this issue: ${{ github.event.issue.title }}",
    "            ${{ github.event.issue.body }}",
  ]));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line, d.params?.trigger]), [["injection", 13, "issues"]]);
});

test("fails on comment text passed via env to an agent command line", async () => {
  const result = await runRepoCheck(here, wf([
    "on: issue_comment",
    "jobs:",
    "  a:",
    "    steps:",
    "      - run: claude -p \"$BODY\"",
    "        env:",
    "          BODY: ${{ github.event.comment.body }}",
    "          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}",
  ]));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [["injection", 7]]);
});

test("warns when the agent has neither secrets nor write rights", async () => {
  const result = await runRepoCheck(here, wf([
    "on: pull_request_target",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: actions/ai-inference@v1",
    "        with:",
    "          prompt: ${{ github.event.pull_request.body }}",
  ]));
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].key, "injection_readonly");
});

test("fails when everyone may start the agent", async () => {
  const result = await runRepoCheck(here, wf([
    "on: issues",
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: anthropics/claude-code-action@v1",
    "        with:",
    "          allowed_non_write_users: '*'",
    "          github_token: ${{ secrets.GITHUB_TOKEN }}",
  ]));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [["open_to_all", 7]]);
});

test("only warns when everyone may start an agent whose token cannot change code", async () => {
  const result = await runRepoCheck(here, wf([
    "on: issues",
    "jobs:",
    "  a:",
    "    permissions:",
    "      contents: read",
    "      issues: write",
    "    steps:",
    "      - uses: anthropics/claude-code-action@v1",
    "        with:",
    "          prompt: /label-issue ${{ github.event.issue.number }}",
    "          allowed_non_write_users: '*'",
    "          github_token: ${{ secrets.GITHUB_TOKEN }}",
  ]));
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["open_to_all_limited"]);
});

test("leaves members-only jobs and push triggers alone", async () => {
  const gated = wf([
    "on: issue_comment",
    "jobs:",
    "  a:",
    "    if: github.event.comment.author_association == 'OWNER'",
    "    steps:",
    "      - uses: anthropics/claude-code-action@v1",
    "        with:",
    "          prompt: ${{ github.event.comment.body }}",
  ]);
  assert.equal((await runRepoCheck(here, gated)).status, "pass");
  const push = wf(["on: push", "jobs:", "  a:", "    steps:", "      - uses: openai/codex-action@v1", "        with:", "          prompt: ${{ github.event.head_commit.message }}"]);
  assert.equal((await runRepoCheck(here, push)).status, "pass");
});
