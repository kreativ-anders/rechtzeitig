// Visible suppressions: `.github/rechtzeitig.yml` in the scanned repository turns rules off, each with a
// category and a reason. A turned-off rule still runs; its outcome becomes "suppressed" and keeps what it found,
// the reason and the status it would have had, so nothing drops out of the report silently. An entry with a problem
// turns nothing off, and the rule quality/suppressions (QUAL-SUPPRESS-001) lists every problem.

import { globSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";
import { loadYaml } from "./data.ts";
import { DAY } from "./deadline.ts";
import { oneLine } from "./text.ts";
import type { Outcome, OutcomeStatus } from "./runner.ts";
import type { Params } from "./sdk.ts";

/** Where the file lives, relative to the scanned repository. */
export const SUPPRESSIONS_FILE = ".github/rechtzeitig.yml";
/** The rule that checks the file. It cannot turn itself off. */
export const SUPPRESSIONS_RULE = "QUAL-SUPPRESS-001";
/**
 * Why a rule is off. `not-applicable`: the duty does not apply to this project (no shop, a microenterprise).
 * `false-positive`: the rule is wrong here. `accepted-risk`: the finding is real and accepted for a time.
 */
export const CATEGORIES = ["not-applicable", "false-positive", "accepted-risk"] as const;
export type Category = (typeof CATEGORIES)[number];
/** Categories that need `expires`: an accepted risk is looked at again. */
export const NEEDS_EXPIRY: readonly Category[] = ["accepted-risk"];
const FIELDS = ["rule", "category", "reason", "expires"] as const;
const TOP = ["suppress"] as const;

const LIMITS = loadYaml<Record<string, { min_reason_chars: number; max_expiry_days: number }>>("data/thresholds.yml")["quality/suppressions"];
const MAX_FILE_BYTES = loadYaml<{ repo: { max_file_bytes: number } }>("data/thresholds.yml").repo.max_file_bytes;
/** Letters and digits only, lower case: "N/A" and "n.a." are the same placeholder. */
const normalized = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const PLACEHOLDERS = new Set(loadYaml<{ placeholders: string[] }>("data/suppressions.yml").placeholders.map(normalized));

export interface Suppression {
  rule: string;
  category: Category;
  reason: string;
  /** Last day the entry applies, YYYY-MM-DD. */
  expires?: string;
  /** Line of the entry in the file. */
  line: number;
}

export interface SuppressionProblem {
  line?: number;
  /** Message key in lang/<code>.yml `messages.quality/suppressions`. */
  key: string;
  params?: Params;
}

export interface Suppressions {
  file: string;
  /** Valid entries; only these turn rules off. */
  entries: Suppression[];
  problems: SuppressionProblem[];
}

/** What an outcome keeps of the entry that turned its rule off. */
export interface AppliedSuppression extends Suppression {
  file: string;
  /** The status the rule would have without the entry. */
  status: OutcomeStatus;
}

let ids: Set<string> | undefined;
/** Every rule id in checks/<group>/<name>/rule.yml, read once. */
export function ruleIds(): Set<string> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  ids ??= new Set(globSync("checks/*/*/rule.yml", { cwd: root }).map((f) => loadYaml<{ id: string }>(f).id));
  return ids;
}

/** YYYY-MM-DD in UTC. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** A real calendar day as YYYY-MM-DD: 2027-02-30 is not one. */
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && isoDay(new Date(s)) === s;

/**
 * Reads the file in `root` (the scanned repository). Undefined when there is none. Like every repository file it is
 * untrusted: only a regular file up to `repo.max_file_bytes` is read, never through a symlink.
 */
export function loadSuppressions(root: string, today = new Date()): Suppressions | undefined {
  const path = join(root, SUPPRESSIONS_FILE);
  let size: number;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) return { file: SUPPRESSIONS_FILE, entries: [], problems: [{ key: "not_regular" }] };
    size = stat.size;
  } catch {
    return undefined;
  }
  if (size > MAX_FILE_BYTES) return { file: SUPPRESSIONS_FILE, entries: [], problems: [{ key: "too_large", params: { limit: MAX_FILE_BYTES / 1_000_000 } }] };
  return { file: SUPPRESSIONS_FILE, ...parseSuppressions(readFileSync(path, "utf8"), today) };
}

/** Parses and validates the file's text. `known` are the rule ids that exist. */
export function parseSuppressions(text: string, today = new Date(), known = ruleIds()): Omit<Suppressions, "file"> {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  const lineAt = (node: unknown) => {
    const range = (node as { range?: [number, number, number] | null } | null)?.range;
    return range ? lines.linePos(range[0]).line : undefined;
  };
  const problems: SuppressionProblem[] = [];
  if (doc.errors.length) {
    const e = doc.errors[0];
    return { entries: [], problems: [{ line: lines.linePos(e.pos[0]).line, key: "unreadable", params: { error: oneLine(e.message.split("\n")[0]) } }] };
  }
  const top = doc.contents;
  if (top === null || (isScalar(top) && top.value === null)) return { entries: [], problems };
  if (!isMap(top)) return { entries: [], problems: [{ line: lineAt(top), key: "not_a_map" }] };
  for (const pair of top.items) {
    const name = isScalar(pair.key) ? String(pair.key.value) : "";
    if (!(TOP as readonly string[]).includes(name)) problems.push({ line: lineAt(pair.key), key: "unknown_field", params: { field: oneLine(name), allowed: TOP.join(", ") } });
  }
  const list = top.get("suppress", true);
  if (list === undefined || (isScalar(list) && list.value === null)) return { entries: [], problems };
  if (!isSeq(list)) return { entries: [], problems: [...problems, { line: lineAt(list), key: "not_a_list" }] };

  const todayIso = isoDay(today);
  const seen = new Map<string, number>();
  const entries: Suppression[] = [];
  for (const item of list.items) {
    const line = lineAt(item) ?? 1;
    if (!isMap(item)) {
      problems.push({ line, key: "entry_not_a_map" });
      continue;
    }
    const own: SuppressionProblem[] = [];
    for (const pair of item.items) {
      const name = isScalar(pair.key) ? String(pair.key.value) : "";
      if (!(FIELDS as readonly string[]).includes(name)) own.push({ line: lineAt(pair.key), key: "unknown_field", params: { field: oneLine(name), allowed: FIELDS.join(", ") } });
    }
    const field = (name: (typeof FIELDS)[number]) => {
      const node = item.get(name, true);
      return { value: isScalar(node) ? node.value : node === undefined ? undefined : node, line: lineAt(node) ?? line };
    };
    const [rule, category, reason, expires] = FIELDS.map(field);
    const id = typeof rule.value === "string" ? rule.value.trim() : "";
    const shown = oneLine(id || "?");
    if (!id) own.push({ line: rule.line, key: "missing_rule" });
    else if (id === SUPPRESSIONS_RULE) own.push({ line: rule.line, key: "self", params: { rule: shown } });
    else if (!known.has(id)) own.push({ line: rule.line, key: "unknown_rule", params: { rule: shown } });
    else if (seen.has(id)) own.push({ line: rule.line, key: "duplicate", params: { rule: shown, first: seen.get(id)! } });

    const allowed = CATEGORIES.join(", ");
    const cat = typeof category.value === "string" ? category.value.trim() : "";
    if (category.value === undefined || category.value === null || (typeof category.value === "string" && !cat)) own.push({ line: category.line, key: "missing_category", params: { rule: shown, allowed } });
    else if (!(CATEGORIES as readonly string[]).includes(cat)) own.push({ line: category.line, key: "bad_category", params: { rule: shown, value: oneLine(String(category.value)), allowed } });

    const why = typeof reason.value === "string" ? reason.value.trim() : "";
    if (!why) own.push({ line: reason.line, key: "missing_reason", params: { rule: shown } });
    else if (PLACEHOLDERS.has(normalized(why))) own.push({ line: reason.line, key: "placeholder_reason", params: { rule: shown, reason: oneLine(why) } });
    else if ([...why].length < LIMITS.min_reason_chars) own.push({ line: reason.line, key: "short_reason", params: { rule: shown, min: LIMITS.min_reason_chars } });

    let until: string | undefined;
    if (expires.value === undefined || expires.value === null) {
      if ((NEEDS_EXPIRY as readonly string[]).includes(cat)) own.push({ line, key: "missing_expiry", params: { rule: shown, category: cat } });
    } else if (typeof expires.value !== "string" || !isDay(expires.value.trim())) {
      own.push({ line: expires.line, key: "bad_date", params: { rule: shown, value: oneLine(String(expires.value)) } });
    } else {
      until = expires.value.trim();
      const ahead = (Date.parse(until) - Date.parse(todayIso)) / DAY;
      if (until < todayIso) own.push({ line: expires.line, key: "expired", params: { rule: shown, date: until } });
      else if (ahead > LIMITS.max_expiry_days) own.push({ line: expires.line, key: "too_far", params: { rule: shown, date: until, max: LIMITS.max_expiry_days } });
    }

    if (id && !seen.has(id)) seen.set(id, line);
    if (own.length) {
      problems.push(...own);
      continue;
    }
    entries.push({ rule: id, category: cat as Category, reason: why, ...(until && { expires: until }), line });
  }
  // In the order of the file, so the report reads top to bottom.
  return { entries, problems: problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)) };
}

/**
 * Turns the outcomes of suppressed rules into "suppressed", keeping their message, details and the status they
 * would have. A rule that did not run (skip) stays a skip: there is nothing to hide.
 */
export function applySuppressions(outcomes: Outcome[], s?: Pick<Suppressions, "file" | "entries">): Outcome[] {
  if (!s?.entries.length) return outcomes;
  const byRule = new Map(s.entries.map((e) => [e.rule, e]));
  return outcomes.map((o) => {
    const entry = byRule.get(o.rule.id);
    if (!entry || o.status === "skip" || o.status === "suppressed") return o;
    return { ...o, status: "suppressed", suppression: { ...entry, file: s.file, status: o.status } };
  });
}
