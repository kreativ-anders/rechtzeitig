import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORT_SCHEMA_FILE } from "./docs.ts";
import { reportSchema, SCHEMA_VERSION, toReportJson } from "./report-json.ts";
import { toSarif } from "./sarif.ts";
import { OUTCOMES, type Outcome } from "./runner.ts";
import type { Rule } from "./rules.ts";
import type { RepoCoverage } from "./sdk.ts";

const rule = { id: "SEC-TEST-001", severity: "high", title: "Title", how: "h", fix_hint: "Fix it", meta: { last_reviewed: "2026-11-03", sources: [] } } as Rule;
const meta = { version: "0", startedAt: "2026-11-21T05:17:00.000Z", target: { url: "https://example.de/", languages: ["de"], languages_from: "page" as const } };
const secrets: Outcome = {
  id: "security/secrets", rule, status: "fail", message: { key: "secrets", params: { count: 3 } },
  details: [
    { file: "config.js", line: 3, key: "secret", params: { name: "AWS", start: "AKIA", length: 20 } },
    { file: "config.js", line: 9, key: "secret", params: { name: "AWS", start: "AKIA", length: 20 } },
    { file: "b.js", text: "found" },
    "https://example.de/app.js",
    "cdn.example.com",
  ],
};
const all: Outcome[] = [
  secrets,
  ...OUTCOMES.filter((s) => s !== "fail").map((status) => ({
    id: "legal/imprint", rule, status, message: { key: "no_link", params: { page: { key: "page_imprint" } } }, details: [],
    ...(status === "skip" && { because: { kind: "switch" as const, input: "sales" as const } }),
    ...(status === "suppressed" && { suppression: { rule: rule.id, category: "accepted-risk" as const, reason: "Accepted until the move.", expires: "2027-01-01", file: ".github/rechtzeitig.yml", line: 2, status: "fail" as const } }),
  })),
];

test("each place is an object with only the fields that apply and a fingerprint", () => {
  const [r] = toReportJson([secrets], meta).results;
  assert.equal(r.message, "3 secrets found. Revoke them, then remove them from the code and the git history.");
  assert.equal(r.fix_hint, "Fix it");
  assert.deepEqual(r.locations.map(({ fingerprint, ...l }) => l), [
    { file: "config.js", line: 3, key: "secret", params: { name: "AWS", start: "AKIA", length: 20 }, message: r.locations[0].message },
    { file: "config.js", line: 9, key: "secret", params: { name: "AWS", start: "AKIA", length: 20 }, message: r.locations[1].message },
    { file: "b.js", text: "found" },
    { url: "https://example.de/app.js" },
    { text: "cdn.example.com" },
  ]);
  const prints = r.locations.map((l) => l.fingerprint);
  // The same finding twice in a file: the line is left out, a counter tells them apart.
  assert.equal(prints[0].replace(/:1$/, ":2"), prints[1]);
  assert.equal(new Set(prints).size, prints.length);
});

test("a fingerprint stays when the line or the wording changes, and differs per file and rule", () => {
  const print = (d: Outcome["details"][number], id = rule.id) => toReportJson([{ ...secrets, rule: { ...rule, id }, details: [d] }], meta).results[0].locations[0].fingerprint;
  const d = { file: "a.js", line: 3, key: "secret", params: { name: "AWS" } };
  assert.equal(print(d), print({ ...d, line: 40 }));
  assert.notEqual(print(d), print({ ...d, file: "b.js" }));
  assert.notEqual(print(d), print(d, "SEC-OTHER-001"));
  assert.equal(print({ ...d, fingerprint: "osv:1" }), print({ ...d, params: { name: "changed" }, fingerprint: "osv:1" }));
});

test("file places carry the same fingerprint as their SARIF alert", () => {
  const base = "sub";
  const json = toReportJson([secrets], { ...meta, base }).results[0].locations.filter((l) => l.file).map((l) => l.fingerprint);
  const sarif = toSarif({ outcomes: [secrets], version: "0", startedAt: "now", onGitHub: true }, { base }) as { runs: Array<{ results: Array<{ partialFingerprints: Record<string, string> }> }> };
  assert.deepEqual(sarif.runs[0].results.map((x) => x.partialFingerprints["rechtzeitig/v1"]), json);
});

test("examples/report.schema.json is current (npm run docs)", () => {
  assert.deepEqual(JSON.parse(readFileSync(REPORT_SCHEMA_FILE, "utf8")), reportSchema());
});

const dfa: Outcome = {
  id: "dfa/fake-notification", rule: { ...rule, id: "LEG-DFA-002", severity: "medium", value: "Digital Fairness Act proposal COM(2026) 1100, Annex I point 61: x" },
  status: "warn", message: { key: "found", params: { count: 1 } }, details: [],
};

test("a report with every status, skip reason, suppression and coverage matches the schema", () => {
  const coverage = { listing: "git", submodules: [], lfs: [], large: [], binary: [], lockfiles: { parsed: [], empty: [], failed: [] }, unsupported: [], private: [] } as RepoCoverage;
  const report = JSON.parse(JSON.stringify(toReportJson([...all, dfa], { ...meta, coverage })));
  assert.equal(report.schema_version, SCHEMA_VERSION);
  assert.deepEqual(validate(reportSchema() as Schema, report), []);
  // v0.10.0 wrote `preview` for rules of the DFA proposal: its reports still validate as schema 2.
  const old = { ...report, results: [{ ...report.results[0], preview: { proposal: "dfa", title: "t", status: "proposal" } }] };
  assert.deepEqual(validate(reportSchema() as Schema, old), []);
  // The validator itself catches what the schema forbids.
  const broken = { ...report, results: [{ ...report.results[0], locations: [{ file: "a", extra: 1 }] }], schema_version: 1 };
  assert.deepEqual(validate(reportSchema() as Schema, broken).sort(), ["$.results[0].locations[0]: extra is not allowed", "$.results[0].locations[0]: fingerprint is missing", "$.schema_version: must be 2"]);
});

type Schema = Record<string, unknown>;
/**
 * The part of JSON Schema that reportSchema() uses: type, const, enum, pattern, minimum, required, properties,
 * additionalProperties, items, anyOf and $ref into $defs. Returns one line per problem.
 */
function validate(root: Schema, value: unknown, schema: Schema = root, path = "$"): string[] {
  if (typeof schema.$ref === "string") return validate(root, value, (root.$defs as Record<string, Schema>)[schema.$ref.replace("#/$defs/", "")], path);
  if (schema.anyOf) return (schema.anyOf as Schema[]).some((s) => !validate(root, value, s, path).length) ? [] : [`${path}: matches no allowed form`];
  const p: string[] = [];
  const types: Record<string, (v: unknown) => boolean> = {
    object: (v) => typeof v === "object" && v !== null && !Array.isArray(v), array: Array.isArray, string: (v) => typeof v === "string",
    number: (v) => typeof v === "number", integer: Number.isInteger, boolean: (v) => typeof v === "boolean",
  };
  if (typeof schema.type === "string" && !types[schema.type](value)) return [`${path}: must be ${schema.type}`];
  if ("const" in schema && value !== schema.const) p.push(`${path}: must be ${schema.const}`);
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) p.push(`${path}: ${JSON.stringify(value)} is not one of the values`);
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value as string)) p.push(`${path}: does not match ${schema.pattern}`);
  if (typeof schema.minimum === "number" && (value as number) < schema.minimum) p.push(`${path}: below ${schema.minimum}`);
  if (schema.type === "object") {
    const v = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const r of (schema.required ?? []) as string[]) if (!(r in v)) p.push(`${path}: ${r} is missing`);
    for (const [k, x] of Object.entries(v)) {
      if (props[k]) p.push(...validate(root, x, props[k], `${path}.${k}`));
      else if (schema.additionalProperties === false) p.push(`${path}: ${k} is not allowed`);
      else if (typeof schema.additionalProperties === "object") p.push(...validate(root, x, schema.additionalProperties as Schema, `${path}.${k}`));
    }
  }
  if (schema.type === "array" && schema.items) (value as unknown[]).forEach((x, i) => p.push(...validate(root, x, schema.items as Schema, `${path}[${i}]`)));
  return p;
}
