import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rendered, runCheck, scanFixture } from "../../../test/helpers.ts";
import check from "./check.ts";

const here = import.meta.dirname;

test("passes when nothing is public", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails for a public .env and .git folder", async () => {
  // Git cannot store a folder named .git, so the fixture gets it at runtime.
  const site = mkdtempSync(join(tmpdir(), "rechtzeitig-leaky-"));
  cpSync(join(here, "fixtures", "leaky"), site, { recursive: true });
  mkdirSync(join(site, ".git"));
  writeFileSync(join(site, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");
  const result = rendered(here, await check.run(await scanFixture(site)));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["/.env", "/.git/config"]);
});

test("ignores servers that answer every path with HTML", async () => {
  assert.equal((await runCheck(here, "html-fallback")).status, "pass");
});

// "No evidence means pass" review: a path that got no answer, or no path asked at all, proves nothing.
test("no pass for paths that got no answer, skip without any", async () => {
  const { runFake } = await import("../../../test/helpers.ts");
  const probe = (status: number) => ({ path: "/.env", kind: "file" as const, status, headers: {}, body: "", exposed: false });
  assert.equal((await runFake(here, {}, { probes: [probe(404)] })).status, "pass");
  const result = await runFake(here, {}, { probes: [probe(404), { ...probe(0), path: "/.git/config" }] });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["/.git/config"]);
  assert.equal((await runFake(here, {}, { probes: [] })).status, "skip");
});
