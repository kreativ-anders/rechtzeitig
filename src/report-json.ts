// rechtzeitig-report.json, the interface for machines and coding agents: every outcome with its message key,
// parameters, English message and fix hint, and every place as an object with a stable fingerprint.
// No page text, no file contents. The JSON Schema (examples/report.schema.json) is generated from reportSchema()
// by npm run docs; src/report-json.test.ts validates real reports against it.

import { OUTCOMES, type Because, type Outcome, type OutcomeStatus } from "./runner.ts";
import { SEVERITIES, SWITCHES } from "./rules.ts";
import type { Finding, LanguagesFrom, Params, RepoCoverage } from "./sdk.ts";
import { isWebUrl, oneLine } from "./text.ts";
import { findingText, render } from "./messages.ts";
import { fingerprints } from "./fingerprint.ts";
import { CATEGORIES } from "./suppress.ts";

/** Raised on every change that can break a reader: a removed or renamed field, a field with a new meaning. */
export const SCHEMA_VERSION = 2;
export const REPORT_SCHEMA_URL = "https://raw.githubusercontent.com/kreativ-anders/rechtzeitig/main/examples/report.schema.json";

/** One place of a result. Only the fields that apply are set. */
export interface Location {
  /** File relative to the scanned repository, with `line` when known. */
  file?: string;
  line?: number;
  /** A web address the finding is about (a page, a script, a request). */
  url?: string;
  /** A value shown as it is that is no web address: a host, a cookie name, a package. */
  text?: string;
  /** Message key of this place (lang/en.yml `messages.<check>` or `common`) and its parameters. */
  key?: string;
  params?: Params;
  /** `key` rendered in English. */
  message?: string;
  /** Stable id of this place across runs, without line or shown text (src/fingerprint.ts). */
  fingerprint: string;
}

export interface Result {
  /** Rule id from rule.yml, the key for suppressions and translations. */
  rule: string;
  /** Check id, the folder below checks/. */
  check: string;
  title: string;
  severity: string;
  status: OutcomeStatus;
  /** In English. */
  message: string;
  /** Message key and parameters (lang/en.yml `messages`), to build the message in any language. */
  key?: string;
  params?: Params;
  /** What to do, in English (rule.yml). */
  fix_hint: string;
  locations: Location[];
  /** Why a check was skipped: target (no url or checkout), module, switch, or data (nothing to read). */
  because?: Because;
  /** For status "suppressed": the entry in .github/rechtzeitig.yml and the status the rule would have without it. */
  suppression?: { category: string; reason: string; expires?: string; file: string; line: number; status: OutcomeStatus };
}

export interface ReportJson {
  $schema: string;
  schema_version: typeof SCHEMA_VERSION;
  /** Version of rechtzeitig that wrote the report. */
  version: string;
  startedAt: string;
  /** `languages`: the scan languages (lang/*.yml packs) and whether they came from the input or the start page. */
  target: { url?: string; repository?: string; languages?: string[]; languages_from?: LanguagesFrom };
  /** What the repository scan could not see or read: submodules, LFS pointers, unread files, lockfiles, private sources. */
  coverage?: RepoCoverage;
  results: Result[];
}

export interface ReportMeta {
  version: string;
  startedAt: string;
  target: ReportJson["target"];
  coverage?: RepoCoverage;
  /** Scanned repository's folder relative to the checkout, for fingerprints that match SARIF. */
  base?: string;
}

/** Parameters can hold text from the scanned site; one line each, like every other output. */
const cleanParams = (params?: Params): Params | undefined =>
  params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, cleanValue(v)]));
const cleanValue = (v: Params[string]): Params[string] => {
  if (typeof v === "string") return oneLine(v);
  if (typeof v === "number") return v;
  return { key: v.key, ...(v.params && { params: cleanParams(v.params) }) };
};

function location(detail: Finding | string, scope: string, fingerprint: string): Location {
  const d: Finding = typeof detail === "string" ? { text: detail } : detail;
  const value = d.text === undefined ? undefined : oneLine(d.text);
  return {
    ...(d.file && { file: oneLine(d.file) }),
    ...(d.file && d.line && { line: d.line }),
    ...(value && (isWebUrl(value) ? { url: value } : { text: value })),
    ...(d.key && { key: d.key, ...(d.params && { params: cleanParams(d.params) }), message: oneLine(findingText(d, scope)) }),
    fingerprint,
  };
}

export function toReportJson(outcomes: Outcome[], { base = "", ...meta }: ReportMeta): ReportJson {
  return {
    $schema: REPORT_SCHEMA_URL,
    schema_version: SCHEMA_VERSION,
    ...meta,
    results: outcomes.map((o) => {
      const prints = fingerprints(o, base);
      return {
        rule: o.rule.id,
        check: o.id,
        title: o.rule.title,
        severity: o.rule.severity,
        status: o.status,
        message: oneLine(render(o.message, o.id)),
        ...(typeof o.message === "string" ? {} : { key: o.message.key, ...(o.message.params && { params: cleanParams(o.message.params) }) }),
        fix_hint: o.rule.fix_hint,
        locations: o.details.map((d, i) => location(d, o.id, prints[i])),
        ...(o.because && { because: o.because }),
        ...(o.suppression && { suppression: suppressionJson(o.suppression) }),
      };
    }),
  };
}


/** The entry as the report JSON keeps it; the reason comes from the repository, so it is one line like every other text. */
const suppressionJson = (s: NonNullable<Outcome["suppression"]>) => ({
  category: s.category, reason: oneLine(s.reason), ...(s.expires && { expires: s.expires }), file: s.file, line: s.line, status: s.status,
});

/** JSON Schema (draft 2020-12) of rechtzeitig-report.json. */
export function reportSchema(): Record<string, unknown> {
  const strings = { type: "array", items: { type: "string" } };
  const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: "object", additionalProperties: false, required, properties });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: REPORT_SCHEMA_URL,
    title: "rechtzeitig report",
    description: "rechtzeitig-report.json, schema_version 2. Field reference: https://github.com/kreativ-anders/rechtzeitig/wiki/Report-format",
    ...obj({
      $schema: { type: "string" },
      schema_version: { const: SCHEMA_VERSION },
      version: { type: "string", description: "rechtzeitig version that wrote the report" },
      startedAt: { type: "string", format: "date-time" },
      target: obj({
        url: { type: "string" },
        repository: { type: "string" },
        languages: strings,
        languages_from: { enum: ["input", "page", "default"] },
      }),
      coverage: { type: "object", description: "What the repository scan could not see or read" },
      results: { type: "array", items: { $ref: "#/$defs/result" } },
    }, ["$schema", "schema_version", "version", "startedAt", "target", "results"]),
    $defs: {
      params: {
        type: "object",
        description: "Message parameters. A value is a string, a number, or a message of its own (key and params).",
        additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { $ref: "#/$defs/message" }] },
      },
      message: obj({ key: { type: "string" }, params: { $ref: "#/$defs/params" } }, ["key"]),
      location: obj({
        file: { type: "string" },
        line: { type: "integer", minimum: 1 },
        url: { type: "string" },
        text: { type: "string" },
        key: { type: "string" },
        params: { $ref: "#/$defs/params" },
        message: { type: "string" },
        fingerprint: { type: "string", pattern: "^[0-9a-f]{64}:[1-9][0-9]*$" },
      }, ["fingerprint"]),
      because: {
        type: "object",
        required: ["kind"],
        properties: {
          kind: { enum: ["target", "module", "switch", "data"] },
          missing: { enum: ["url", "repository", "both"] },
          both: { const: true },
          modules: strings,
          input: { enum: Object.keys(SWITCHES) },
        },
        additionalProperties: false,
      },
      result: obj({
        rule: { type: "string" },
        check: { type: "string" },
        title: { type: "string" },
        severity: { enum: [...SEVERITIES] },
        status: { enum: [...OUTCOMES] },
        message: { type: "string" },
        key: { type: "string" },
        params: { $ref: "#/$defs/params" },
        fix_hint: { type: "string" },
        locations: { type: "array", items: { $ref: "#/$defs/location" } },
        because: { $ref: "#/$defs/because" },
        // Kept so reports of v0.10.0 still validate; schema_version stays 2 because no reader needs it.
        preview: { type: "object", description: "Only in reports of v0.10.0, for rules of the Digital Fairness Act proposal; no longer written." },
        suppression: obj({
          category: { enum: [...CATEGORIES] },
          reason: { type: "string" },
          expires: { type: "string" },
          file: { type: "string" },
          line: { type: "integer" },
          status: { enum: [...OUTCOMES] },
        }, ["category", "reason", "file", "line", "status"]),
      }, ["rule", "check", "title", "severity", "status", "message", "fix_hint", "locations"]),
    },
  };
}
