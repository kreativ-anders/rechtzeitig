import { test } from "node:test";
import assert from "node:assert/strict";
import { toSarif, workflowFile } from "./sarif.ts";
import type { Report } from "./report.ts";
import type { Rule } from "./rules.ts";
import type { ScanContext } from "./sdk.ts";

const rule = (id: string) => ({ id, severity: "high", title: { de: "t", en: "Title" }, how: "h", fix_hint: { de: "f", en: "Fix it" }, legal_basis: { de: "l", en: "Art. 32 DSGVO" }, meta: { last_reviewed: "2026-11-04", sources: [] } }) as Rule;
const report = (outcomes: Report["outcomes"], web = false): Report => ({
  outcomes, version: "1.2.3", startedAt: "now", onGitHub: true, language: "en",
  ...(web ? { web: { url: "https://example.de/" } as ScanContext } : {}),
});
type Sarif = { version: string; runs: Array<{ tool: { driver: { rules: Array<{ id: string; helpUri: string; properties: Record<string, unknown> }> } }; results: Array<{ ruleId: string; level: string; message: { text: string }; locations?: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }>; partialFingerprints: Record<string, string> }> }> };
const sarif = (r: Report, opts = {}) => toSarif(r, opts) as Sarif;

test("findings in files point to their file and line, passed and skipped checks are left out", () => {
  const s = sarif(report([
    { id: "security/secrets", rule: rule("SEC-SECRETS-001"), status: "fail", message: "Secret found", details: [{ file: "config.js", line: 3, text: "AWS key" }] },
    { id: "security/headers", rule: rule("SEC-HDR-001"), status: "pass", message: "ok", details: [] },
    { id: "security/x", rule: rule("SEC-X-001"), status: "skip", message: "off", details: [] },
  ]), { base: "app" });
  assert.equal(s.version, "2.1.0");
  const [result] = s.runs[0].results;
  assert.equal(s.runs[0].results.length, 1);
  assert.equal(result.level, "error");
  assert.equal(result.locations![0].physicalLocation.artifactLocation.uri, "app/config.js");
  assert.equal(result.locations![0].physicalLocation.region.startLine, 3);
  assert.deepEqual(s.runs[0].tool.driver.rules.map((r) => r.id), ["SEC-SECRETS-001"]);
  assert.equal(s.runs[0].tool.driver.rules[0].properties["security-severity"], "8.0");
  assert.match(s.runs[0].tool.driver.rules[0].helpUri, /checks\.html#SEC-SECRETS-001$/);
});

test("website findings become one alert at the workflow file, with the URL and details", () => {
  const s = sarif(report([{ id: "privacy/cookies", rule: rule("LEG-EU-COOKIE-001"), status: "warn", message: "Cookies before consent", details: ["_ga", "_fbp"] }], true),
    { anchor: ".github/workflows/rechtzeitig.yml" });
  const [result] = s.runs[0].results;
  assert.equal(result.level, "warning");
  assert.equal(result.locations![0].physicalLocation.artifactLocation.uri, ".github/workflows/rechtzeitig.yml");
  assert.match(result.message.text, /Cookies before consent \(https:\/\/example\.de\/\)\n- _ga\n- _fbp/);
  assert.equal(s.runs[0].tool.driver.rules[0].properties["security-severity"], undefined);
});

test("fingerprints ignore the line and stay apart for repeated findings", () => {
  const at = (line: number) => sarif(report([{ id: "security/secrets", rule: rule("SEC-SECRETS-001"), status: "fail", message: "m", details: [{ file: "a.js", line, text: "k" }, { file: "a.js", line: line + 5, text: "k" }] }]));
  const [a, b] = at(1).runs[0].results.map((r) => r.partialFingerprints["rechtzeitig/v1"]);
  assert.notEqual(a, b);
  assert.deepEqual(at(10).runs[0].results.map((r) => r.partialFingerprints["rechtzeitig/v1"]), [a, b]);
});

test("a finding's own fingerprint keeps the alert when its parameters change", () => {
  const fp = (summary: string, fingerprint?: string) => sarif(report([{ id: "repo/vulnerabilities", rule: rule("SEC-DEPS-001"), status: "warn", message: "m",
    details: [{ file: "package-lock.json", key: "issue", params: { summary }, ...(fingerprint ? { fingerprint } : {}) }] }])).runs[0].results[0].partialFingerprints["rechtzeitig/v1"];
  assert.equal(fp("old", "pkg:npm/a@1 GHSA-1"), fp("new, fixed in 2", "pkg:npm/a@1 GHSA-1"));
  assert.notEqual(fp("old"), fp("new"));
});

test("messages from the site stay on one line each", () => {
  const s = sarif(report([{ id: "legal/imprint", rule: rule("LEG-DE-IMP-001"), status: "fail", message: "bad\nline", details: ["x\ny"] }]));
  assert.equal(s.runs[0].results[0].message.text, "bad line\n- x y");
});

test("the workflow file comes from GITHUB_WORKFLOW_REF", () => {
  assert.equal(workflowFile("me/site/.github/workflows/rechtzeitig.yml@refs/heads/main", "me/site"), ".github/workflows/rechtzeitig.yml");
  assert.equal(workflowFile("other/repo/.github/workflows/x.yml@refs/heads/main", "me/site"), undefined);
  assert.equal(workflowFile(undefined, "me/site"), undefined);
});
