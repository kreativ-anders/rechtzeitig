// Runs the command line entry on a small repository. fetch throws, so any request to api.osv.dev would turn
// the vulnerabilities rule into a warn instead of a skip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NO_FETCH = "data:text/javascript,globalThis.fetch=()=>{throw new Error('network used')}";

function run(...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-main-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "package-lock.json"), JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } }));
    const out = join(dir, "report");
    execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts",
      "--repo", repo, "--modules", "repo", "--out", out, ...args], { stdio: "pipe", env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } });
    const findings = JSON.parse(readFileSync(`${out}.json`, "utf8"));
    return findings.results.find((r: { check: string }) => r.check === "repo/vulnerabilities");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("vulnerabilities=false skips the OSV lookup", () => {
  const result = run("--vulnerabilities", "false", "--report-language", "en");
  assert.equal(result.status, "skip");
  assert.match(result.message, /turned off/);
});

test("the OSV lookup runs by default", () => {
  const result = run();
  assert.equal(result.status, "warn");
  assert.match(result.message, /network used/);
});
