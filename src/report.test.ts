import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarkdown, toText, withoutCommands, type Report } from "./report.ts";
import { toFindings } from "./sink.ts";
import { oneLine } from "./text.ts";
import type { Rule } from "./rules.ts";

const rule = { id: "SEC-TEST-001", severity: "high", tier: "free", title: { de: "t", en: "t" }, how: "h", fix_hint: { de: "f", en: "f" }, meta: { last_reviewed: "2026-11-03", sources: [] } } as Rule;
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
  assert.doesNotMatch(md, /<img|\]\(http|\[a\]/);
  assert.match(md, /&#60;img src=x&#62; &#91;a&#93;&#40;http:\/\/evil&#41;/);
  assert.match(md, /- d ::error title=x::y\n/);
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
