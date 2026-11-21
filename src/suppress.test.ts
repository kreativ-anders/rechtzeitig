import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySuppressions, loadSuppressions, parseSuppressions, ruleIds, SUPPRESSIONS_RULE } from "./suppress.ts";
import type { Rule } from "./rules.ts";
import type { Outcome } from "./runner.ts";

const today = new Date("2026-11-14T10:00:00Z");
const known = new Set(["A11Y-ALT-001", "SEC-HDR-001", SUPPRESSIONS_RULE]);
const parse = (yaml: string) => parseSuppressions(yaml, today, known);
const keys = (yaml: string) => parse(yaml).problems.map((p) => p.key);
const entry = (fields: string) => `suppress:\n  - rule: A11Y-ALT-001\n${fields}`;
const reason = '    reason: "Kleinstunternehmen, das BFSG gilt nicht"\n';

test("a valid entry with category and reason turns its rule off; expires is optional for not-applicable", () => {
  const s = parse(entry(`    category: not-applicable\n${reason}`));
  assert.deepEqual(s.problems, []);
  assert.deepEqual(s.entries, [{ rule: "A11Y-ALT-001", category: "not-applicable", reason: "Kleinstunternehmen, das BFSG gilt nicht", line: 2 }]);
});

test("an empty file or one without suppress turns nothing off and is no problem", () => {
  for (const yaml of ["", "# nothing yet\n", "suppress:\n", "suppress: []\n"]) assert.deepEqual(parse(yaml), { entries: [], problems: [] }, yaml);
});

test("rule, category and reason are required, and the category must be one of three", () => {
  assert.deepEqual(keys("suppress:\n  - category: not-applicable\n" + reason), ["missing_rule"]);
  assert.deepEqual(keys(entry(reason)), ["missing_category"]);
  assert.deepEqual(keys(entry(`    category: wontfix\n${reason}`)), ["bad_category"]);
  assert.deepEqual(keys(entry("    category: false-positive\n")), ["missing_reason"]);
  assert.deepEqual(keys(entry('    category: false-positive\n    reason: "  "\n')), ["missing_reason"]);
});

test("a placeholder or too short reason is no reason", () => {
  for (const r of ["N/A", "n.a.", "todo", "TBD", "-", "später", "kein Grund"]) assert.deepEqual(keys(entry(`    category: false-positive\n    reason: "${r}"\n`)), ["placeholder_reason"], r);
  assert.deepEqual(keys(entry('    category: false-positive\n    reason: "Kein Shop"\n')), ["short_reason"]);
});

test("expires must be a real day, not passed and at most a year ahead; an accepted risk needs it", () => {
  const withDate = (d: string) => keys(entry(`    category: accepted-risk\n${reason}    expires: ${d}\n`));
  assert.deepEqual(withDate("2027-06-30"), []);
  assert.deepEqual(withDate("2026-11-14"), [], "the day itself still counts");
  assert.deepEqual(withDate("2026-11-13"), ["expired"]);
  assert.deepEqual(withDate("2027-02-30"), ["bad_date"]);
  assert.deepEqual(withDate("30.06.2027"), ["bad_date"]);
  assert.deepEqual(withDate("2027-6-30"), ["bad_date"]);
  assert.deepEqual(withDate("tomorrow"), ["bad_date"]);
  assert.deepEqual(withDate("2028-01-01"), ["too_far"]);
  assert.deepEqual(keys(entry(`    category: accepted-risk\n${reason}`)), ["missing_expiry"]);
});

test("unknown ids, this rule itself, duplicates and unknown fields are problems", () => {
  assert.deepEqual(keys(`suppress:\n  - rule: A11Y-NOPE-001\n    category: false-positive\n${reason}`), ["unknown_rule"]);
  assert.deepEqual(keys(`suppress:\n  - rule: ${SUPPRESSIONS_RULE}\n    category: false-positive\n${reason}`), ["self"]);
  const twice = entry(`    category: not-applicable\n${reason}`) + `  - rule: A11Y-ALT-001\n    category: not-applicable\n${reason}`;
  const s = parse(twice);
  assert.deepEqual([s.entries.length, s.problems.map((p) => [p.key, p.params?.first])], [1, [["duplicate", 2]]]);
  assert.deepEqual(keys(entry(`    category: not-applicable\n${reason}    expire: 2027-01-01\n`)), ["unknown_field"]);
  assert.deepEqual(keys(`ignore:\n  - A11Y-ALT-001\n`), ["unknown_field"]);
});

test("an entry with a problem turns nothing off; the valid ones still do", () => {
  const s = parse(entry(`    category: not-applicable\n${reason}`) + "  - rule: SEC-HDR-001\n    category: accepted-risk\n" + reason);
  assert.deepEqual(s.entries.map((e) => e.rule), ["A11Y-ALT-001"]);
  assert.deepEqual(s.problems.map((p) => [p.key, p.line]), [["missing_expiry", 5]]);
});

test("broken YAML and wrong shapes are problems with a line, never an exception", () => {
  assert.deepEqual(parse("suppress:\n  - rule: [x\n").problems.map((p) => p.key), ["unreadable"]);
  assert.deepEqual(keys("- A11Y-ALT-001\n"), ["not_a_map"]);
  assert.deepEqual(keys("suppress: A11Y-ALT-001\n"), ["not_a_list"]);
  assert.deepEqual(keys("suppress:\n  - A11Y-ALT-001\n"), ["entry_not_a_map"]);
  assert.deepEqual(keys(entry("    category: [a, b]\n    reason: 42\n")), ["bad_category", "missing_reason"]);
});

test("the file is read from .github/ of the repository, never through a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-suppress-"));
  assert.equal(loadSuppressions(root), undefined);
  mkdirSync(join(root, ".github"));
  writeFileSync(join(root, "elsewhere.yml"), "suppress: []\n");
  symlinkSync(join(root, "elsewhere.yml"), join(root, ".github/rechtzeitig.yml"));
  assert.deepEqual(loadSuppressions(root)?.problems.map((p) => p.key), ["not_regular"]);
});

test("every rule id is known, and this rule's own id among them", () => {
  const ids = ruleIds();
  assert.ok(ids.has(SUPPRESSIONS_RULE) && ids.has("A11Y-ALT-001") && ids.size > 50);
});

const rule = (id: string) => ({ id, severity: "high", title: "t", how: "h", fix_hint: "f", meta: { last_reviewed: "2026-11-14", sources: [] } }) as Rule;
const outcome = (id: string, status: Outcome["status"]): Outcome => ({ id: id.toLowerCase(), rule: rule(id), status, message: "m", details: ["d"] });

test("a suppressed rule keeps its message, details and the status it would have; skips stay skips", () => {
  const s = { file: ".github/rechtzeitig.yml", entries: [
    { rule: "A11Y-ALT-001", category: "not-applicable" as const, reason: "Kleinstunternehmen", line: 2 },
    { rule: "SEC-HDR-001", category: "accepted-risk" as const, reason: "CSP next release", expires: "2027-01-01", line: 5 },
  ] };
  const [alt, hdr, other] = applySuppressions([outcome("A11Y-ALT-001", "fail"), outcome("SEC-HDR-001", "skip"), outcome("SEC-X-001", "warn")], s);
  assert.equal(alt.status, "suppressed");
  assert.deepEqual([alt.message, alt.details, alt.suppression?.status, alt.suppression?.file, alt.suppression?.line], ["m", ["d"], "fail", ".github/rechtzeitig.yml", 2]);
  assert.deepEqual([hdr.status, hdr.suppression], ["skip", undefined]);
  assert.deepEqual([other.status, other.suppression], ["warn", undefined]);
});

test("examples/rechtzeitig.yml turns nothing off as copied, and its commented entries are valid", () => {
  const text = readFileSync(new URL("../examples/rechtzeitig.yml", import.meta.url), "utf8");
  assert.deepEqual(parseSuppressions(text, today), { entries: [], problems: [] });
  const [examples, list] = text.split(/^.*# rules:start.*$/m);
  const s = parseSuppressions(examples.replace(/^  # (- |  )/gm, "  $1"), today);
  assert.deepEqual(s.problems, []);
  assert.deepEqual(s.entries.map((e) => e.category), ["not-applicable", "false-positive", "accepted-risk"]);
  // Every rule but this one is listed; an uncommented line alone names a known rule and asks for category and reason.
  const listed = [...list.matchAll(/^  # - rule: (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(new Set(listed), new Set([...ruleIds()].filter((id) => id !== SUPPRESSIONS_RULE)));
  const one = parseSuppressions(`suppress:\n  - rule: ${listed[0]}\n`, today);
  assert.deepEqual(one.problems.map((p) => p.key), ["missing_category", "missing_reason"]);
});
