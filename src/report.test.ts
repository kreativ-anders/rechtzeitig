import { test } from "node:test";
import assert from "node:assert/strict";
import { toAnnotations, toCounts, toSummary, toText, withoutCommands, type Report } from "./report.ts";
import { toReportJson } from "./report-json.ts";
import { oneLine } from "./text.ts";
import type { Rule } from "./rules.ts";
import type { Outcome } from "./runner.ts";
import type { RepoContext, RepoCoverage } from "./sdk.ts";

const rule = { id: "SEC-TEST-001", severity: "high", title: "t", how: "h", fix_hint: "f", meta: { last_reviewed: "2026-11-03", sources: [] } } as Rule;
const report = (message: string, details: string[]): Report => ({
  outcomes: [{ id: "security/test", rule, status: "fail", message, details }],
  version: "0", startedAt: "now", onGitHub: true,
});
const evilFile = "d\n::error title=x::y";
const evilLink = "<img src=x> [a](http://evil)";

test("log output never starts a line with a workflow command", () => {
  const text = toText(report(`::warning::${evilFile}`, [evilFile, "\r::add-mask::z"]));
  assert.ok(text.split("\n").every((line) => !/^\s*::/.test(line)), text);
  assert.match(text, /- d ::error title=x::y$/m);
});

test("log output is wrapped in a random stop-commands block", () => {
  const [first, ...rest] = withoutCommands("x").split("\n");
  const token = first.replace("::stop-commands::", "");
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal(rest.at(-1), `::${token}::`);
  assert.notEqual(withoutCommands("x"), withoutCommands("x"));
});

test("the step summary escapes Markdown and HTML in messages and leaves the details to the JSON", () => {
  const md = toSummary(report(`Link ${evilLink}`, [evilLink, evilFile]));
  assert.doesNotMatch(md, /<img|\]\(http:\/\/evil|\[a\]/);
  assert.match(md, /&#60;img src=x&#62; &#91;a&#93;&#40;http:\/\/evil&#41; \(2 places\)/);
  assert.doesNotMatch(md, /::error/);
});

test("the step summary names the tool and its maker", () => {
  assert.match(toSummary(report("m", [])), /- \[rechtzeitig\]\(https:\/\/github\.com\/kreativ-anders\/rechtzeitig\) 0 · by \[kreativ-anders\]\(https:\/\/kreativ-anders\.de\) · now$/m);
});

test("the step summary has one line per finding, most urgent first, and no check without one", () => {
  const outcome = (id: string, status: "fail" | "warn" | "pass" | "skip", details: string[] = []) => ({ id, rule: { ...rule, id }, status, message: id, details });
  const r: Report = { ...report("m", []), outcomes: [outcome("SEC-W-001", "warn"), outcome("SEC-A-001", "fail", ["a", "b"]), outcome("SEC-P-001", "pass", ["note"]), outcome("SEC-S-001", "skip")] };
  const summary = toSummary(r);
  assert.match(summary, /^- ❌ `SEC-A-001` t · high: SEC-A-001 \(2 places\)\n- ⚠️ `SEC-W-001` t · high: SEC-W-001$/m);
  assert.doesNotMatch(summary, /SEC-P-001|SEC-S-001/);
  assert.match(summary, /❌ 1 finding · ⚠️ 1 warning · ○ 1 no finding · ⏭️ 1 skipped/);
  assert.match(summary, /_One line per finding\./);
  assert.match(summary, /<summary>ℹ️ What no scan can check<\/summary>/);
  const clean = toSummary({ ...r, outcomes: [outcome("SEC-P-001", "pass")] });
  assert.match(clean, /_No findings\./);
  assert.doesNotMatch(clean, /^- [❌⚠️ℹ️]/mu);
});

test("warnings such as a missing sandbox show in the summary and the log", () => {
  const r = { ...report("m", []), warnings: ["Chrome sandbox not available on this runner"] };
  assert.match(toSummary(r), /- ⚠️ Chrome sandbox not available on this runner/);
  assert.match(toText(r), /^Warning: Chrome sandbox not available/m);
});

test("findings are single, capped lines", () => {
  const { results } = toReportJson(report(evilFile, ["x".repeat(1000)]).outcomes, { version: "0", startedAt: "now", target: {} });
  assert.equal(results[0].message, "d ::error title=x::y");
  assert.equal(results[0].locations[0].text?.length, 300);
  assert.equal(oneLine("a\u202eb\u0000c"), "a b c");
});

test("annotations escape file names, titles and text, so nothing becomes a second command", () => {
  const r: Report = {
    outcomes: [{ id: "security/secrets", rule, status: "fail", message: { key: "secrets", params: { count: 1 } }, details: [
      { file: "a,b:c\n::error::x%", line: 3, key: "secret", params: { name: "Token\n::warning::y", start: "ghp_", length: 40 } },
      "no file, no annotation",
    ] }],
    version: "0", startedAt: "now", onGitHub: true,
  };
  const lines = toAnnotations(r, "sub/dir");
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "::error file=sub/dir/a%2Cb%3Ac %3A%3Aerror%3A%3Ax%25,line=3,title=t (SEC-TEST-001)::Token ::warning::y (ghp_… (40 chars))");
});

test("messages are rendered with plural forms", () => {
  const outcome = (count: number) => ({ id: "security/secrets", rule, status: "fail" as const, message: { key: "secrets", params: { count } }, details: [] });
  const text = (count: number) => toText({ outcomes: [outcome(count)], version: "0", startedAt: "now", onGitHub: false });
  assert.match(text(1), /1 secret found\./i);
  assert.match(text(3), /3 secrets found\./i);
});

test("findings carry the message key and clean parameters for tools", () => {
  const r: Report = {
    outcomes: [{ id: "legal/imprint", rule, status: "fail", message: { key: "no_link", params: { page: { key: "page_imprint" }, where: "a\n::x" } }, details: [] }],
    version: "0", startedAt: "now", onGitHub: false,
  };
  const [f] = toReportJson(r.outcomes, { version: "0", startedAt: "now", target: {} }).results;
  assert.match(f.message, /imprint/);
  assert.equal(f.key, "no_link");
  assert.deepEqual(f.params, { page: { key: "page_imprint" }, where: "a ::x" });
});

test("skipped checks show grouped by reason under Not run, also in counts mode, and carry because in the JSON", () => {
  const skipped = (id: string, because: Outcome["because"], message: Outcome["message"]) => ({ id, rule: { ...rule, id: id.toUpperCase() }, status: "skip" as const, message, details: [], because });
  const r: Report = {
    ...report("m", []),
    outcomes: [
      { id: "security/secrets", rule, status: "pass", message: "fine", details: [] },
      skipped("legal/imprint", { kind: "target", missing: "url" }, { key: "not_run_url" }),
      skipped("legal/privacy-policy", { kind: "target", missing: "url" }, { key: "not_run_url" }),
      skipped("legal/order-button", { kind: "switch", input: "sales" }, { key: "switch_sales" }),
      skipped("security/actions-pinning", { kind: "data" }, { key: "no_workflows" }),
    ],
  };
  const summary = toSummary(r);
  assert.match(summary, /<details><summary>⏭️ Not run \(4\)<\/summary>/);
  assert.match(summary, /- 2 website checks: no url\. Set the input url to run them\./);
  assert.match(summary, /- 1 check: Only needed when consumers buy .*sales: true/);
  assert.match(summary, /- 1 check ran but found nothing it could read\.\n {2}- t \(SECURITY\/ACTIONS-PINNING\): No GitHub workflows\./);
  assert.doesNotMatch(toSummary(r), /LEGAL\/IMPRINT/, "checks without a target are not listed one by one");
  const counts = toCounts(r, "md");
  assert.match(counts, /Not run \(4\)[\s\S]*2 website checks: no url/);
  assert.doesNotMatch(counts, /ACTIONS-PINNING|No GitHub workflows/, "counts mode names no check");
  assert.match(toText(r), /^ {2}2 website checks: no url/m);
  const results = toReportJson(r.outcomes, { version: "0", startedAt: "now", target: {} }).results;
  assert.deepEqual(results.map((x) => x.because?.kind), [undefined, "target", "target", "switch", "data"]);
});

test("the scan line lists what the repository scan could not see or read", () => {
  const coverage: RepoCoverage = {
    listing: "git",
    submodules: [{ path: "vendor/lib", checkedOut: false }, { path: "ui", checkedOut: true }],
    lfs: ["data/big.csv"],
    large: ["dump.sql"],
    binary: ["logo.png"],
    lockfiles: { parsed: ["package-lock.json"], empty: [], failed: [{ file: "web/package-lock.json", reason: "lfs" }] },
    unsupported: [{ file: "java/pom.xml", ecosystem: "Maven" }],
    private: [{ file: ".npmrc", kind: "registry", source: "npm.corp.example" }],
  };
  const repo = { root: "/x", files: ["a"], components: [], lockfiles: ["package-lock.json"], osv: "ok", coverage } as unknown as RepoContext;
  const md = toSummary({ ...report("m", []), repo });
  assert.match(md, / {2}- ⚠️ 1 submodule not checked out, its files were not scanned: vendor\/lib\. Check out with submodules: recursive\./);
  assert.match(md, / {2}- 1 submodule scanned: ui/);
  assert.match(md, /⚠️ 1 Git LFS pointer instead of the file: data\/big\.csv/);
  assert.match(md, /⚠️ 1 lockfile gave no components: web\/package-lock\.json \(Git LFS pointer\)/);
  assert.match(md, /⚠️ 1 package file without a parser, not in the SBOM: java\/pom\.xml \(Maven\)/);
  assert.match(md, /1 file over 1 MB not read: dump\.sql/);
  assert.match(md, /1 private package source, named only, never contacted: registry npm\.corp\.example \(\.npmrc\)/);
  assert.match(toText({ ...report("m", []), repo }), /^Warning: 1 submodule not checked out/m);
});

test("severities are shown in the summary", () => {
  assert.match(toSummary(report("m", [])), /· high: m/);
});

test("a suppressed rule stays in every output with its reason, escaped, and gives no annotation", () => {
  const suppressed: Outcome = {
    id: "security/test", rule, status: "suppressed", message: "m", details: [{ file: "a.js", line: 3, text: "found" }],
    suppression: { rule: rule.id, category: "false-positive", reason: `Generated ${evilLink}`, line: 4, file: ".github/rechtzeitig.yml", status: "fail" },
  };
  const r: Report = { ...report("m", []), outcomes: [suppressed] };
  const md = toSummary(r);
  assert.match(md, /⏸️ 1 suppressed/);
  assert.match(md, /⏸️ Turned off \(false positive\): Generated &#60;img/);
  assert.doesNotMatch(md, /<img/);
  assert.match(toText(r), /SUPPRESSED security\/test[\s\S]*Turned off \(false positive\)[\s\S]*Without the entry: finding\. Entry: \.github\/rechtzeitig\.yml:4[\s\S]*A false positive\? Please report it/);
  assert.deepEqual(toAnnotations(r), []);
  const json = toReportJson(r.outcomes, { version: "0", startedAt: "now", target: {} });
  assert.deepEqual(json.results[0].suppression, { category: "false-positive", reason: oneLine(`Generated ${evilLink}`), file: ".github/rechtzeitig.yml", line: 4, status: "fail" });
  // Public repositories see the count only, never the reason.
  const counts = toCounts(r, "md");
  assert.match(counts, /1 suppressed/);
  assert.doesNotMatch(counts, /Generated/);
});

test("the summary names the scan language", () => {
  const web = { url: "https://example.de/", pages: [], short: (u: string) => u, languages: ["de"], subscriptions: false, sales: false } as unknown as Report["web"];
  assert.match(toSummary({ ...report("m", []), web }), /- Language: de · /);
});

