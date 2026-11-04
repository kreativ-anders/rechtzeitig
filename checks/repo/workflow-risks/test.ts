import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const wf = (body: string) => ({ ".github/workflows/ci.yml": body });

test("passes for a workflow with read permissions and values passed via env", async () => {
  const body = [
    "on: [push, pull_request]",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  a:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo \"$TITLE\"",
    "        env:",
    "          TITLE: ${{ github.event.pull_request.title }}",
  ].join("\n");
  assert.equal((await runRepoCheck(here, wf(body))).status, "pass");
});

test("skips without workflows", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("fails on a checkout of the PR head under pull_request_target", async () => {
  const body = [
    "on: pull_request_target",
    "permissions: {}",
    "jobs:",
    "  a:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.event.pull_request.head.sha }}",
  ].join("\n");
  const result = await runRepoCheck(here, wf(body));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [["checkout_head", 8]]);
});

test("does not flag a PR head checkout under pull_request", async () => {
  const body = "on: pull_request\npermissions: {}\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n";
  assert.equal((await runRepoCheck(here, wf(body))).status, "pass");
});

test("fails on outside-controlled expressions in run and script blocks", async () => {
  const body = [
    "on:",
    "  issues:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  a:",
    "    steps:",
    "      - run: |",
    "          echo hello",
    "          echo \"${{ github.event.issue.title }}\"",
    "      - uses: actions/github-script@v7",
    "        with:",
    "          script: console.log(\"${{ github.event.comment.body }}\")",
    "      - name: ${{ github.event.issue.title }}",
    "        run: echo ${{ github.event.issue.number }}",
  ].join("\n");
  const result = await runRepoCheck(here, wf(body));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line]), [["injection", 10], ["injection", 13]]);
});

test("warns on curl | sh, write-all and missing permissions", async () => {
  const files = {
    ".github/workflows/a.yml": "on: push\npermissions: write-all\njobs:\n  a:\n    steps:\n      - run: curl -fsSL https://example.com/install.sh | sudo bash\n",
    ".github/workflows/b.yml": "on: push\njobs:\n  a:\n    steps:\n      - run: echo ok\n",
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.key, d.line]), [
    [".github/workflows/a.yml", "pipe_to_shell", 6],
    [".github/workflows/a.yml", "write_all", 2],
    [".github/workflows/b.yml", "no_permissions", 2],
  ]);
});

test("accepts permissions on every job instead of the top", async () => {
  const body = "on: push\njobs:\n  a:\n    permissions:\n      contents: read\n    steps:\n      - run: echo ok\n";
  assert.equal((await runRepoCheck(here, wf(body))).status, "pass");
});
