import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuMs, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const workflow = (uses: string) => `jobs:\n  a:\n    steps:\n      - uses: ${uses}\n      - uses: ./local-action\n`;

test("passes for SHA pinned actions", async () => {
  const files = { ".github/workflows/ci.yml": workflow("actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955") };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("lists actions pinned to a tag", async () => {
  const result = await runRepoCheck(here, { ".github/workflows/ci.yml": workflow("actions/checkout@v4") });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, [".github/workflows/ci.yml:4: actions/checkout@v4"]);
  assert.deepEqual(result.raw.details, [{ file: ".github/workflows/ci.yml", line: 4, text: "actions/checkout@v4" }]);
});

test("stays fast on many blank lines", async () => {
  const files = { ".github/workflows/ci.yml": `${"\n".repeat(20_000)}x` };
  assert.ok((await cpuMs(() => runRepoCheck(here, files))) < 500);
});

test("skips without workflows", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

// "No evidence means pass" review: a file the scan could not read may hold what this check looks for.
test("no pass when one of its files could not be read", async () => {
  const { TOO_LARGE } = await import("../../../test/helpers.ts");
  const clean = {".github/workflows/a.yml":"on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"};
  assert.equal((await runRepoCheck(here, clean)).status, "pass");
  const result = await runRepoCheck(here, { ...clean, ".github/workflows/big.yml": TOO_LARGE });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, [".github/workflows/big.yml: Not read: too large or only a Git LFS pointer."]);
});
