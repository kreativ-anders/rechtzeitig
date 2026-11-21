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
    return findings.results.find((r: { check: string }) => r.check === "security/vulnerabilities");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the OSV lookup is opt-in: off by default, nothing sent", () => {
  const result = run();
  assert.equal(result.status, "skip");
  assert.match(result.message, /^Opt-in: runs only with the input vulnerabilities: true.*Nothing was sent\./);
});

test("vulnerabilities=true runs the OSV lookup", () => {
  const result = run("--vulnerabilities", "true");
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
    // Built at runtime; AWS's documented example key (ending in EXAMPLE) is not reported.
    writeFileSync(join(repo, "config.js"), `const key = "${["AKIA", "Z7Q3MRT2XKWPL4NB"].join("")}";\n`);
    const eventPath = join(dir, "event.json");
    if (event) writeFileSync(eventPath, JSON.stringify(event));
    const summaryPath = join(dir, "summary.md");
    writeFileSync(summaryPath, "");
    const out = join(dir, "out", "rechtzeitig-report");
    mkdirSync(join(dir, "out"));
    const outputPath = join(dir, "output.txt");
    writeFileSync(outputPath, "");
    const reportPath = join(dir, "upload", "rechtzeitig-report.json");
    const log = execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts",
      "--repo", repo, "--modules", "repo", "--vulnerabilities", "false", "--out", out, "--report", reportPath, ...args],
      { stdio: "pipe", encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_PATH: event ? eventPath : "", GITHUB_STEP_SUMMARY: summaryPath, GITHUB_OUTPUT: outputPath, GITHUB_WORKSPACE: dir } });
    const output = readFileSync(outputPath, "utf8");
    return { log, output, summary: readFileSync(summaryPath, "utf8"), files: readdirSync(join(dir, "out")), json: JSON.parse(readFileSync(reportPath, "utf8")), reportPath };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a private repository shows one line per finding, the log, and JSON and SBOM in the artifact", () => {
  const r = onGitHub({ repository: { private: true, visibility: "private" } });
  assert.match(r.summary, /^- ❌ `SEC-SECRETS-001` /m);
  assert.match(r.log, /config\.js/);
  assert.deepEqual(r.files.sort(), ["rechtzeitig-report.json", "rechtzeitig-sbom.cdx.json"]);
});

test("a public repository, or an event without the field, shows only counts and fills no artifact", () => {
  for (const event of [{ repository: { private: false, visibility: "public" } }, { schedule: "0 6 * * 1" }, undefined]) {
    const r = onGitHub(event);
    assert.match(r.summary, /\d+ finding/);
    assert.match(r.summary, /_Details hidden: on a public repository/);
    assert.doesNotMatch(r.summary + r.log, /config\.js|SEC-|::error/);
    assert.deepEqual(r.files, []);
  }
});

test("the report JSON is written for every visibility and named in the output report", () => {
  for (const repository of [{ private: true }, { private: false }]) {
    const r = onGitHub({ repository });
    assert.equal(r.json.schema_version, 2);
    const secret = r.json.results.find((x: { check: string }) => x.check === "security/secrets");
    assert.equal(secret.locations[0].file, "config.js");
    assert.match(secret.locations[0].fingerprint, /^[0-9a-f]{64}:1$/);
    assert.match(r.output, new RegExp(`^report=${r.reportPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});

test("report-visibility was removed: full warns and still shows only counts on a public repository", () => {
  const r = onGitHub({ repository: { private: false } }, "--report-visibility", "full");
  assert.match(r.log, /::warning::report-visibility was removed/);
  assert.doesNotMatch(r.log, /config\.js/);
  assert.deepEqual(r.files, []);
});

test("a removed input that is set warns and changes nothing", () => {
  const r = onGitHub({ repository: { private: true } }, "--report-language", "de");
  assert.match(r.log, /::warning::report-language was removed/);
  assert.match(r.log, /config\.js/);
});

test("sarif writes the findings with places also for a public repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-sarif-"));
  try {
    const file = join(dir, "sarif", "rechtzeitig.sarif");
    const r = onGitHub({ repository: { private: false } }, "--sarif", file);
    assert.deepEqual(r.files, []);
    assert.doesNotMatch(r.log, /config\.js/);
    const sarif = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(sarif.runs[0].results.some((x: { locations?: Array<{ physicalLocation: { artifactLocation: { uri: string } } }> }) =>
      x.locations?.[0].physicalLocation.artifactLocation.uri === "repo/config.js"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty inputs use their defaults, as on schedule and push runs without the dialog", () => {
  // Every option the action passes, empty. The vulnerability lookup is opt-in, so nothing is sent,
  // and the removed report-language warns only when set.
  const empty = ["language", "report-language", "subscriptions", "sales", "fail-on", "max-pages", "vulnerabilities",
    "green-hosting", "require-sandbox", "report-visibility", "sarif"].flatMap((o) => [`--${o}`, ""]);
  const result = run(...empty);
  assert.equal(result.status, "skip");
  assert.match(result.message, /^Opt-in: runs only with the input vulnerabilities: true/);
});
