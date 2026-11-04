import { test } from "node:test";
import assert from "node:assert/strict";
import { toAnnotations, toFindings, toMarkdown, toText, withoutCommands, type Report } from "./report.ts";
import { oneLine } from "./text.ts";
import type { Rule } from "./rules.ts";

const rule = { id: "SEC-TEST-001", severity: "high", title: { de: "t", en: "t" }, how: "h", fix_hint: { de: "f", en: "f" }, meta: { last_reviewed: "2026-11-03", sources: [] } } as Rule;
const report = (message: string, details: string[]): Report => ({
  outcomes: [{ id: "security/test", rule, status: "fail", message, details }],
  version: "0", startedAt: "now", onGitHub: true, language: "en",
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

test("the step summary escapes Markdown and HTML in messages and details", () => {
  const md = toMarkdown(report(`Link ${evilLink}`, [evilLink, evilFile]));
  assert.doesNotMatch(md, /<img|\]\(http:\/\/evil|\[a\]/);
  assert.match(md, /&#60;img src=x&#62; &#91;a&#93;&#40;http:\/\/evil&#41;/);
  assert.match(md, /- d ::error title=x::y\n/);
});

test("the step summary names the tool and its maker in the report language", () => {
  assert.match(toMarkdown(report("m", [])), /- \[rechtzeitig\]\(https:\/\/github\.com\/kreativ-anders\/rechtzeitig\) 0 · by \[kreativ-anders\]\(https:\/\/kreativ-anders\.de\) · now$/m);
  assert.match(toMarkdown({ ...report("m", []), language: "de" }), /· von \[kreativ-anders\]/);
});

test("the step summary shows only findings, the full report every check", () => {
  const outcome = (id: string, status: "fail" | "pass" | "skip", details: string[] = []) => ({ id, rule: { ...rule, id }, status, message: id, details });
  const r: Report = { ...report("m", []), outcomes: [outcome("SEC-A-001", "fail"), outcome("SEC-P-001", "pass", ["note"]), outcome("SEC-S-001", "skip")] };
  const summary = toMarkdown(r, { findingsOnly: true });
  assert.match(summary, /SEC-A-001/);
  assert.doesNotMatch(summary, /SEC-P-001|SEC-S-001/);
  assert.match(summary, /❌ 1 fail · ✅ 1 pass · ⏭️ 1 skip/);
  assert.match(summary, /_Findings only\./);
  assert.match(toMarkdown(r), /SEC-P-001[\s\S]*SEC-S-001/);
  const clean = toMarkdown({ ...r, outcomes: [outcome("SEC-P-001", "pass")] }, { findingsOnly: true });
  assert.match(clean, /_No findings\./);
  assert.doesNotMatch(clean, /\| Check \|/);
});

test("warnings such as a missing sandbox show in the summary and the log", () => {
  const r = { ...report("m", []), warnings: ["Chrome sandbox not available on this runner"] };
  assert.match(toMarkdown(r), /- ⚠️ Chrome sandbox not available on this runner/);
  assert.match(toText(r), /^Warning: Chrome sandbox not available/m);
});

test("findings are single, capped lines", () => {
  const { results } = toFindings(report(evilFile, ["x".repeat(1000)]).outcomes, { version: "0", startedAt: "now", target: {} });
  assert.equal(results[0].message, "d ::error title=x::y");
  assert.equal(results[0].locations[0].length, 300);
  assert.equal(oneLine("a\u202eb\u0000c"), "a b c");
});

test("annotations escape file names, titles and text, so nothing becomes a second command", () => {
  const r: Report = {
    outcomes: [{ id: "repo/secrets", rule, status: "fail", message: { key: "secrets", params: { count: 1 } }, details: [
      { file: "a,b:c\n::error::x%", line: 3, key: "secret", params: { name: "Token\n::warning::y", start: "ghp_", length: 40 } },
      "no file, no annotation",
    ] }],
    version: "0", startedAt: "now", onGitHub: true, language: "en",
  };
  const lines = toAnnotations(r, "sub/dir");
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "::error file=sub/dir/a%2Cb%3Ac %3A%3Aerror%3A%3Ax%25,line=3,title=t (SEC-TEST-001)::Token ::warning::y (ghp_… (40 chars))");
});

test("messages are rendered in the report language, with plural forms", () => {
  const outcome = (count: number) => ({ id: "repo/secrets", rule, status: "fail" as const, message: { key: "secrets", params: { count } }, details: [] });
  const de = (count: number) => toText({ outcomes: [outcome(count)], version: "0", startedAt: "now", onGitHub: false, language: "de" });
  assert.match(de(1), /1 Secret gefunden\./);
  assert.match(de(3), /3 Secrets gefunden\./);
});

test("findings carry the message key and clean parameters for tools", () => {
  const r: Report = {
    outcomes: [{ id: "legal/imprint", rule, status: "fail", message: { key: "no_link", params: { page: { key: "page_imprint" }, where: "a\n::x" } }, details: [] }],
    version: "0", startedAt: "now", onGitHub: false, language: "de",
  };
  const [f] = toFindings(r.outcomes, { version: "0", startedAt: "now", target: {} }, "de").results;
  assert.equal(f.message, "Impressum: kein Link auf der Startseite.");
  assert.equal(f.key, "no_link");
  assert.deepEqual(f.params, { page: { key: "page_imprint", params: undefined }, where: "a ::x" });
});

test("the step summary's own wording follows the report language", () => {
  const de = toMarkdown({ ...report("m", []), language: "de" });
  assert.match(de, /\| \| Prüfung \| Schwere \| Ergebnis \|/);
  assert.match(de, /_Technische Risikohinweise .* Keine Rechtsberatung\._/);
  assert.match(toMarkdown(report("m", [])), /\| \| Check \| Severity \| Result \|/);
});

test("severities are shown in the report language", () => {
  assert.match(toMarkdown({ ...report("m", []), language: "de" }), /\| hoch \|/);
  assert.match(toMarkdown(report("m", [])), /\| high \|/);
});
