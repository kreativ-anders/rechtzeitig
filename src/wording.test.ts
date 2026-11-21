// Findings are technical risk hints, never legal advice: no text a reader sees may sound like approval or
// compliance. The status key "pass" in the report JSON, function names and inputs stay; they are not shown as words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { availableLanguages } from "./lang.ts";
import { OUTCOMES, type Outcome } from "./runner.ts";
import type { Rule } from "./rules.ts";
import { toCounts, toSummary, toText, type Report } from "./report.ts";
import { wikiPages } from "../test/wiki.ts";

const APPROVAL = [/\b(pass(es|ed|ing)?|compliant|konform|erfüllt|bestanden(e[nrs]?)?|besteh(en|t))\b|✅|✔|✓/i, /\bOK\b/];
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Every hit as "where: …text…", so a failure names the place. */
function hits(where: string, text: string): string[] {
  return APPROVAL.flatMap((re) => {
    const m = re.exec(text);
    return m ? [`${where}: …${text.slice(Math.max(0, m.index - 40), m.index + 40)}…`] : [];
  });
}
const strings = (v: unknown, path: string): Array<[string, string]> =>
  typeof v === "string" ? [[path, v]] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`)) : [];
/** Code is not wording: `pass` in a code span names a Python statement or a value. */
const noCode = (s: string) => s.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

test("report messages in lang/*.yml use no word that sounds like approval", () => {
  const found = availableLanguages().flatMap((code) =>
    strings(parse(read(`lang/${code}.yml`)).messages, `lang/${code}.yml messages`).flatMap(([p, s]) => hits(p, noCode(s))));
  assert.deepEqual(found, []);
});

test("rule titles, legal bases, fix hints and how they are checked use no word that sounds like approval", () => {
  const found = readdirSync(new URL("../checks", import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((group) =>
    readdirSync(new URL(`../checks/${group.name}`, import.meta.url)).flatMap((name) => {
      const path = `checks/${group.name}/${name}/rule.yml`;
      const { title, legal_basis, fix_hint, value, how } = parse(read(path)) as Rule;
      return strings({ title, legal_basis, fix_hint, value, how }, path).flatMap(([p, s]) => hits(p, noCode(s)));
    }));
  assert.deepEqual(found, []);
});

test("the report shows every status without a word that sounds like approval", () => {
  const rule = { id: "SEC-TEST-001", severity: "high", title: "t", how: "h", fix_hint: "f", meta: { last_reviewed: "2026-11-14", sources: [] } } as Rule;
  const outcomes: Outcome[] = OUTCOMES.map((status) => ({
    id: "security/test", rule, status, message: "m", details: [],
    ...(status === "suppressed" && { suppression: { rule: rule.id, category: "accepted-risk", reason: "r", file: ".github/rechtzeitig.yml", line: 1, status: "pass" } }),
  } as Outcome));
  const r: Report = { outcomes, version: "0", startedAt: "now", onGitHub: true };
  const out = [toSummary(r), toText(r), toCounts(r, "md"), toCounts(r, "text")].join("\n");
  assert.deepEqual(hits("report", out), []);
});

test("the wiki and the README use no word that sounds like approval", () => {
  const pages = wikiPages().map((f) => `wiki/${f}`);
  const found = [...pages, "README.md"].flatMap((p) => hits(p, noCode(read(p))));
  assert.deepEqual(found, []);
});
