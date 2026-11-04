// Runs the command line entry on a small repository. fetch throws, so any request to api.osv.dev would turn
// the vulnerabilities rule into a warn instead of a skip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Runs the entry as on GitHub with the given event payload; returns the log, the step summary and the files written.
function onGitHub(event: object | undefined, ...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-gh-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "package-lock.json"), JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } }));
    writeFileSync(join(repo, "config.js"), 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    const eventPath = join(dir, "event.json");
    if (event) writeFileSync(eventPath, JSON.stringify(event));
    const summaryPath = join(dir, "summary.md");
    writeFileSync(summaryPath, "");
    const out = join(dir, "out", "rechtzeitig-report");
    mkdirSync(join(dir, "out"));
    const log = execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts",
      "--repo", repo, "--modules", "repo", "--vulnerabilities", "false", "--report-language", "en", "--out", out, ...args],
      { stdio: "pipe", encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: event ? eventPath : "", GITHUB_STEP_SUMMARY: summaryPath, GITHUB_OUTPUT: "", GITHUB_WORKSPACE: dir } });
    return { log, summary: readFileSync(summaryPath, "utf8"), files: readdirSync(join(dir, "out")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("report-visibility auto shows the full report for a private repository", () => {
  const r = onGitHub({ repository: { private: true, visibility: "private" } });
  assert.match(r.summary, /SEC-/);
  assert.match(r.log, /config\.js/);
  assert.deepEqual(r.files.sort(), ["rechtzeitig-report.json", "rechtzeitig-report.md", "rechtzeitig-sbom.cdx.json"]);
});

test("report-visibility auto shows only counts for a public repository or an event without the field", () => {
  for (const event of [{ repository: { private: false, visibility: "public" } }, { schedule: "0 6 * * 1" }, undefined]) {
    const r = onGitHub(event);
    assert.match(r.summary, /\d+ fail/);
    assert.match(r.summary, /_Details hidden: on a public repository/);
    assert.doesNotMatch(r.summary + r.log, /config\.js|SEC-|::error/);
    assert.deepEqual(r.files, []);
  }
});

test("report-visibility full and none override the repository's visibility", () => {
  const pub = { repository: { private: false } };
  assert.match(onGitHub(pub, "--report-visibility", "full").log, /config\.js/);
  const none = onGitHub(pub, "--report-visibility", "none");
  assert.equal(none.summary, "");
  assert.doesNotMatch(none.log, /fail|config\.js/);
  assert.match(none.log, /report-visibility: none/);
  assert.deepEqual(none.files, []);
  assert.match(onGitHub({ repository: { private: true } }, "--report-visibility", "counts").summary, /Details hidden by report-visibility: counts/);
});
