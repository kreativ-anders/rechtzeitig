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
