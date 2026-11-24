// Runs the command line entry on a small repository. fetch throws, so any request to api.osv.dev would turn
// the vulnerabilities rule into an error instead of a skip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { serve } from "../test/helpers.ts";

const NO_FETCH = "data:text/javascript,globalThis.fetch=()=>{throw new Error('network used')}";

function run(...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-main-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "package-lock.json"), JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } }));
    const out = join(dir, "report");
    execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts",
      "--repo", repo, "--out", out, ...args], { stdio: "pipe", env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } });
    const findings = JSON.parse(readFileSync(`${out}.json`, "utf8"));
    return findings.results.find((r: { check: string }) => r.check === "security/vulnerabilities");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("modules takes groups only: a scope such as repository stops with one line", () => {
  const args = ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts", "--modules", "legal,repository"];
  const env = { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" };
  assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe", env, encoding: "utf8" }),
    (e: { stdout?: string; stderr?: string }) => /modules: unknown group repository\. Groups: /.test(`${e.stdout}${e.stderr}`));
});

test("the OSV lookup is opt-in: off by default, nothing sent", () => {
  const result = run();
  assert.equal(result.status, "skip");
  assert.match(result.message, /^Opt-in: runs only with the input vulnerabilities: true.*Nothing was sent\./);
});

test("vulnerabilities=true runs the OSV lookup", () => {
  // fail-on never: OSV that cannot be asked is an error, which fails the job by default.
  const result = run("--vulnerabilities", "true", "--fail-on", "never");
  assert.equal(result.status, "error");
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
      // fail-on never: these tests read what a run shows; the default fail would end the process with 1 on the finding
      "--repo", repo, "--vulnerabilities", "false", "--fail-on", "never", "--out", out, "--report", reportPath, ...args],
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

test("fail-on is fail by default: a failing check ends the run with 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-failon-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "config.js"), `const key = "${["AKIA", "Z7Q3MRT2XKWPL4NB"].join("")}";\n`);
    const args = ["--disable-warning=ExperimentalWarning", "--import", NO_FETCH, "src/main.ts", "--repo", repo, "--out", join(dir, "report")];
    const env = { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" };
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe", env }), (e: { status?: number }) => e.status === 1);
    assert.doesNotThrow(() => execFileSync(process.execPath, [...args, "--fail-on", "never"], { stdio: "pipe", env }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a public repository shows only counts", () => {
  const r = onGitHub({ repository: { private: false } });
  assert.doesNotMatch(r.log, /config\.js/);
  assert.deepEqual(r.files, []);
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
  // Every option the action passes, empty. The vulnerability lookup is opt-in, so nothing is sent.
  const empty = ["subscriptions", "sales", "fail-on", "max-pages", "vulnerabilities",
    "green-hosting", "require-sandbox", "sarif"].flatMap((o) => [`--${o}`, ""]);
  const result = run(...empty);
  assert.equal(result.status, "skip");
  assert.match(result.message, /^Opt-in: runs only with the input vulnerabilities: true/);
});

test("a site neither German nor English stops the run with one line, no report file and no output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-lang-"));
  writeFileSync(join(dir, "index.html"), `<html lang="es"><body>Hola</body></html>`);
  const site = await serve(dir);
  try {
    const [summary, output, report] = ["summary.md", "output.txt", "upload/rechtzeitig-report.json"].map((f) => join(dir, f));
    writeFileSync(summary, "");
    writeFileSync(output, "");
    const failed = await promisify(execFile)(process.execPath, ["--disable-warning=ExperimentalWarning", "src/main.ts", "--url", site.url,
      "--require-sandbox", "false", "--out", join(dir, "out", "rechtzeitig-report"), "--report", report],
      { env: { ...process.env, GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output } }).catch((e) => e);
    assert.equal(failed.code, 2);
    assert.match(failed.stderr, /^rechtzeitig: The start page's language is "es" .*set url to the German or English page/);
    assert.equal(failed.stderr.trim().split("\n").length, 1);
    assert.equal(readFileSync(output, "utf8"), "");
    assert.deepEqual(readdirSync(dir).sort(), ["index.html", "output.txt", "summary.md"]);
  } finally {
    site.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
