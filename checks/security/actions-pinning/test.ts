import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cpuMs, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");
const LOCK = ".github/workflows/actions.lock";

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

test("accepts tag refs recorded in actions.lock, still needs a SHA for reusable workflows and a digest for docker images", async () => {
  const result = await runRepoCheck(here, { ".github/workflows/ci.yml": fixture("ci.yml"), [LOCK]: fixture("actions.lock") });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, [
    ".github/workflows/ci.yml:12: actions/cache@v4",
    ".github/workflows/ci.yml:14: docker://alpine:3.20",
    ".github/workflows/ci.yml:18: octo-org/shared/.github/workflows/build.yml@v1",
  ]);
});

test("passes when every tag ref is locked", async () => {
  const workflow = fixture("ci.yml").split("\n").filter((l) => !/cache@|alpine:|shared|octo-org/.test(l)).join("\n");
  const result = await runRepoCheck(here, { ".github/workflows/ci.yml": workflow, [LOCK]: fixture("actions.lock") });
  assert.equal(result.status, "pass");
});

test("a workflow missing from actions.lock falls back to the SHA test", async () => {
  const files = { ".github/workflows/ci.yml": workflow("actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955"), ".github/workflows/new.yml": workflow("actions/setup-node@v7.1.0"), [LOCK]: fixture("actions.lock") };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, [".github/workflows/new.yml:4: actions/setup-node@v7.1.0"]);
});

test("a tag ref without a lockfile is unpinned", async () => {
  const result = await runRepoCheck(here, { ".github/workflows/ci.yml": fixture("ci.yml") });
  assert.equal(result.status, "info");
  assert.equal(result.raw.details?.length, 5);
});

test("gives info for an unreadable lockfile and does not count its entries", async () => {
  const sha = { ".github/workflows/ci.yml": workflow("actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955"), [LOCK]: fixture("broken.lock") };
  const clean = await runRepoCheck(here, sha);
  assert.equal(clean.status, "info");
  assert.deepEqual(clean.details, [".github/workflows/actions.lock: The workflow lockfile could not be read, so its entries do not count."]);
  const tag = await runRepoCheck(here, { ".github/workflows/ci.yml": workflow("actions/setup-node@v7.1.0"), [LOCK]: fixture("broken.lock") });
  assert.equal(tag.status, "info");
  assert.equal(tag.details?.length, 2);
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
