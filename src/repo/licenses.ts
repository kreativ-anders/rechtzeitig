// Licenses for the license rules in checks/legal/: SPDX expressions, categories from data/licenses.yml,
// the project's own license and which locked dependencies have license data at all.
// Only reads what the repository scan already holds; nothing here contacts a registry.

import { loadYaml } from "../data.ts";
import type { Component, RepoContext } from "../sdk.ts";

// ---------- SPDX expressions

/** One license of an expression, with its exception: `GPL-2.0-only WITH Classpath-exception-2.0`. */
export interface LicenseTerm {
  /** License id as written, `+` included. */
  id: string;
  exception?: string;
}

export type SpdxNode = LicenseTerm | { op: "AND" | "OR"; left: SpdxNode; right: SpdxNode };

/** Longest expression and deepest nesting parsed; longer input is not an expression a lockfile writes. */
const MAX_TOKENS = 200;
const MAX_DEPTH = 32;
/** Most alternatives an expression may expand to (`(A OR B) AND (C OR D)` has four). */
const MAX_CHOICES = 64;

const TOKEN = /\s*(\(|\)|[A-Za-z0-9][A-Za-z0-9.+:-]*)/y;

function tokenize(text: string): string[] | undefined {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let rest = text.trim();
  while (rest) {
    TOKEN.lastIndex = 0;
    const m = TOKEN.exec(rest);
    if (!m) return undefined;
    tokens.push(m[1]);
    rest = rest.slice(m[0].length).trimStart();
    if (tokens.length > MAX_TOKENS) return undefined;
  }
  return tokens;
}

const isOp = (t: string | undefined, op: string) => t !== undefined && t.toUpperCase() === op;
const OPERATORS = new Set(["AND", "OR", "WITH", "(", ")"]);

/**
 * Parses an SPDX license expression (`MIT OR (Apache-2.0 AND BSD-3-Clause)`, `GPL-2.0-only WITH Classpath-exception-2.0`).
 * WITH binds tighter than AND, AND tighter than OR. Operators are also accepted in lower case, as some lockfiles write them.
 * Returns undefined for anything that is not an expression (free text, unbalanced parentheses); never throws.
 */
export function parseSpdx(text: unknown): SpdxNode | undefined {
  if (typeof text !== "string" || text.length > 2000) return undefined;
  const tokens = tokenize(text);
  if (!tokens?.length) return undefined;
  let pos = 0;
  const peek = () => tokens[pos];
  const or = (depth: number): SpdxNode | undefined => {
    let left = and(depth);
    while (left && isOp(peek(), "OR")) {
      pos++;
      const right = and(depth);
      left = right && { op: "OR", left, right };
    }
    return left;
  };
  const and = (depth: number): SpdxNode | undefined => {
    let left = term(depth);
    while (left && isOp(peek(), "AND")) {
      pos++;
      const right = term(depth);
      left = right && { op: "AND", left, right };
    }
    return left;
  };
  const term = (depth: number): SpdxNode | undefined => {
    if (depth > MAX_DEPTH) return undefined;
    const t = peek();
    if (t === "(") {
      pos++;
      const inner = or(depth + 1);
      if (!inner || peek() !== ")") return undefined;
      pos++;
      return inner;
    }
    if (t === undefined || OPERATORS.has(t.toUpperCase())) return undefined;
    pos++;
    if (!isOp(peek(), "WITH")) return { id: t };
    pos++;
    const exception = peek();
    if (exception === undefined || OPERATORS.has(exception.toUpperCase())) return undefined;
    pos++;
    return { id: t, exception };
  };
  const node = or(0);
  return node && pos === tokens.length ? node : undefined;
}

/**
 * The ways to comply with an expression: each alternative lists the licenses that all apply together.
 * `MIT OR (GPL-3.0-only AND BSD-3-Clause)` gives [[MIT], [GPL-3.0-only, BSD-3-Clause]]. Undefined when the
 * expression does not parse or expands to more than MAX_CHOICES alternatives.
 */
export function choices(expression: string): LicenseTerm[][] | undefined {
  const node = parseSpdx(expression);
  if (!node) return undefined;
  const expand = (n: SpdxNode): LicenseTerm[][] | undefined => {
    if (!("op" in n)) return [[n]];
    const left = expand(n.left);
    const right = expand(n.right);
    if (!left || !right) return undefined;
    const out = n.op === "OR" ? [...left, ...right] : left.flatMap((l) => right.map((r) => [...l, ...r]));
    return out.length > MAX_CHOICES ? undefined : out;
  };
  return expand(node);
}

/** The license ids an expression names, in order, without duplicates. */
export const licenseIds = (expression: string): string[] => [...new Set((choices(expression) ?? []).flat().map((t) => t.id))];

// ---------- SPDX ids

const SPDX = loadYaml<{ licenses: string[]; deprecated: string[]; exceptions: string[] }>("data/spdx.yml");
const lower = (list: string[]) => new Map(list.map((id) => [id.toLowerCase(), id]));
const CURRENT = lower(SPDX.licenses);
const DEPRECATED = lower(SPDX.deprecated);
const EXCEPTIONS = lower(SPDX.exceptions);

const CUSTOM = /^(DocumentRef-[A-Za-z0-9.-]+:)?LicenseRef-[A-Za-z0-9.-]+$/;

/** How an id stands in the SPDX License List (data/spdx.yml). `+` ("or later") is allowed after any listed id. */
export function spdxStatus(id: string): "current" | "deprecated" | "custom" | "unknown" {
  if (CUSTOM.test(id)) return "custom";
  const key = id.toLowerCase();
  if (DEPRECATED.has(key)) return "deprecated";
  if (CURRENT.has(key)) return "current";
  const base = key.replace(/\+$/, "");
  if (base !== key && CURRENT.has(base)) return "current";
  if (base !== key && DEPRECATED.has(base)) return "deprecated";
  return "unknown";
}

export const isSpdxException = (id: string) => EXCEPTIONS.has(id.toLowerCase()) || /Commons-?Clause/i.test(id);

// ---------- Categories

export const CATEGORIES = ["source_available", "network_copyleft", "copyleft", "weak_copyleft", "permissive"] as const;
export type Category = (typeof CATEGORIES)[number] | "other" | "unknown";

type LicenseData = Record<(typeof CATEGORIES)[number], Record<string, string>> & { linking_exceptions: string[] };
const DATA = loadYaml<LicenseData>("data/licenses.yml");
const FAMILIES = CATEGORIES.flatMap((category) =>
  Object.entries(DATA[category]).map(([family, pattern]) => ({ category, family, re: new RegExp(pattern, "i") })),
);
const LINKING = DATA.linking_exceptions.map((p) => new RegExp(p, "i"));

/** Restrictiveness, least first. An alternative counts as its most restrictive license. */
const RANK: Record<Category, number> = { permissive: 0, other: 1, weak_copyleft: 2, copyleft: 3, network_copyleft: 4, source_available: 5, unknown: 6 };

export interface Classified extends LicenseTerm {
  category: Category;
  /** Family name from data/licenses.yml (gpl, agpl, busl, ...); empty for other and unknown. */
  family: string;
}

/** Category of one license: an exception such as Commons Clause can make it source-available, a linking exception weak copyleft. */
export function classify(term: LicenseTerm): Classified {
  const hit = (text: string) => FAMILIES.find((f) => f.re.test(text));
  const byException = term.exception ? hit(term.exception) : undefined;
  if (byException?.category === "source_available") return { ...term, category: byException.category, family: byException.family };
  const found = hit(term.id);
  if (found) {
    const linked = found.category === "copyleft" && term.exception && LINKING.some((re) => re.test(term.exception!));
    return { ...term, category: linked ? "weak_copyleft" : found.category, family: found.family };
  }
  const status = spdxStatus(term.id);
  return { ...term, category: status === "current" || status === "deprecated" ? "other" : "unknown", family: "" };
}

// ---------- One license field

/** A license field of a lockfile or manifest, read. */
export interface LicenseInfo {
  /** The value as written. */
  raw: string;
  /**
   * ok: an SPDX expression. missing: no value. unlicensed: npm's UNLICENSED (no rights granted).
   * see_file: "SEE LICENSE IN <file>". unknown: UNKNOWN, NOASSERTION or NONE. invalid: not an SPDX expression.
   */
  status: "ok" | "missing" | "unlicensed" | "see_file" | "unknown" | "invalid";
  /** Every alternative, classified. Empty unless status is ok. */
  alternatives: Classified[][];
  /** The least restrictive alternative: what a user would pick. Empty unless status is ok. */
  chosen: Classified[];
}

const worst = (alt: Classified[]) => Math.max(...alt.map((t) => RANK[t.category]));

export function readLicense(value: string | undefined): LicenseInfo {
  const raw = (value ?? "").trim();
  const none = (status: LicenseInfo["status"]): LicenseInfo => ({ raw, status, alternatives: [], chosen: [] });
  if (!raw) return none("missing");
  if (/^UNLICEN[CS]ED$/i.test(raw)) return none("unlicensed");
  if (/^SEE LICEN[CS]E IN\b/i.test(raw)) return none("see_file");
  if (/^(UNKNOWN|NOASSERTION|NONE)$/i.test(raw)) return none("unknown");
  const alts = choices(raw);
  if (!alts) return none("invalid");
  const alternatives = alts.map((alt) => alt.map(classify));
  const chosen = alternatives.reduce((best, alt) => (worst(alt) < worst(best) ? alt : best));
  return { raw, status: "ok", alternatives, chosen };
}

/** true when no alternative avoids a license for which `test` is true: `MIT OR GPL-3.0-only` avoids GPL, `MIT AND GPL-3.0-only` does not. */
export const unavoidable = (info: LicenseInfo, test: (t: Classified) => boolean): boolean =>
  info.status === "ok" && info.alternatives.every((alt) => alt.some(test));

/** The first license of the least restrictive alternative for which `test` is true. */
export const offending = (info: LicenseInfo, test: (t: Classified) => boolean): Classified | undefined => info.chosen.find(test);

// ---------- Dependencies

const LICENSED = loadYaml<{ licenses_in_lockfile: string[] }>("data/ecosystems.yml").licenses_in_lockfile;

export interface DependencyLicenses {
  /** Production components from lockfiles that carry license data, with their license read. */
  checked: Array<{ component: Component; license: LicenseInfo }>;
  /** Production components from lockfiles without license data (other ecosystems, yarn.lock, package-lock v1). */
  unchecked: Component[];
  /** Ecosystems of `unchecked`, sorted. */
  uncheckedEcosystems: string[];
}

/**
 * Production dependencies split by whether their lockfile names licenses. A lockfile counts when its ecosystem is in
 * data/ecosystems.yml `licenses_in_lockfile` and at least one of its packages has a license field; otherwise its
 * packages are unchecked, never clean.
 */
export function dependencyLicenses(repo: RepoContext): DependencyLicenses {
  const production = repo.components.filter((c) => !c.dev);
  const carrying = new Set(repo.components.filter((c) => c.license && LICENSED.includes(c.ecosystem)).map((c) => c.source));
  const checked = production.filter((c) => carrying.has(c.source)).map((component) => ({ component, license: readLicense(component.license) }));
  const unchecked = production.filter((c) => !carrying.has(c.source));
  return { checked, unchecked, uncheckedEcosystems: [...new Set(unchecked.map((c) => c.ecosystem))].sort() };
}

/** Compares versions as dotted numbers ("v1.6.0", "2.0.0-beta.1", "v8.0.0+incompatible"); a pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/i, "").replace(/\+.*$/, "").split(/-(.*)/s);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? "" };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// ---------- The project's own license

/** License files in the repository root (LICENSE, LICENSE-MIT, COPYING.LESSER, UNLICENSE, ...) and REUSE's LICENSES/<id>.txt. */
export const LICENSE_FILE = /^((LICEN[CS]E|COPYING|UNLICENSE)([-._][\w.-]*)?|LICENSES\/[\w.+-]+\.(txt|md))$/i;

/** Families recognized from a license text, by phrases each text has. The first that matches wins. */
const TEXTS: Array<[string, RegExp]> = [
  ["AGPL-3.0", /GNU AFFERO GENERAL PUBLIC LICENSE/i],
  ["LGPL-3.0", /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3/i],
  ["LGPL-2.1", /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1/i],
  ["LGPL-2.0", /GNU LIBRARY GENERAL PUBLIC LICENSE/i],
  ["GPL-3.0", /GNU GENERAL PUBLIC LICENSE\s+Version 3/i],
  ["GPL-2.0", /GNU GENERAL PUBLIC LICENSE\s+Version 2/i],
  ["EUPL-1.2", /European Union Public Licen[cs]e\s*(v\.?\s*|Version\s*)?1\.2/i],
  ["BUSL-1.1", /Business Source License 1\.1/i],
  ["SSPL-1.0", /Server Side Public License/i],
  ["Elastic-2.0", /Elastic License 2\.0/i],
  ["MPL-2.0", /Mozilla Public License,?\s+(Version|v\.?)\s*2\.0/i],
  ["Apache-2.0", /Apache License,?\s+Version 2\.0/i],
  ["Unlicense", /This is free and unencumbered software released into the public domain/i],
  ["MIT", /Permission is hereby granted, free of charge, to any person obtaining a copy/i],
  ["BSD-3-Clause", /Redistribution and use in source and binary forms[\s\S]{0,1500}Neither the name/i],
  ["BSD-2-Clause", /Redistribution and use in source and binary forms/i],
  ["ISC", /Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted, provided that/i],
  ["0BSD", /Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted\./i],
];

/** The license family a text is, from its first 5000 characters. */
export function detectLicenseText(text: string): string | undefined {
  const head = text.slice(0, 5000).replace(/\s+/g, " ");
  return TEXTS.find(([, re]) => re.test(head))?.[0];
}

/** true when a text adds the Commons Clause to a license. */
export const hasCommonsClause = (text: string) => /Commons Clause/i.test(text);

/** true when an SPDX id belongs to a detected family: GPL-3.0-or-later and the deprecated GPL-3.0 to GPL-3.0. */
export const inFamily = (id: string, family: string) => {
  const a = id.toLowerCase().replace(/\+$/, "");
  const f = family.toLowerCase();
  return a === f || a.startsWith(`${f}-`);
};

// ---------- Text comparison

/** Lower case words, without comments, copyright lines, title lines, URLs, punctuation, list labels and single letters. */
export function normalizeLicenseText(text: string): string[] {
  const cut = text.search(/END OF TERMS AND CONDITIONS/i);
  return (cut >= 0 ? text.slice(0, cut + 27) : text)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split("\n")
    // Copyright lines and a title line ("MIT License", "The MIT License (MIT)") differ between copies.
    // A copyright line names a year or a holder ("Copyright (c) 2024 Jane Doe", "Copyright Jane Doe"); a wrapped line
    // that starts with "copyright notice", "COPYRIGHT HOLDERS" or "copyright, patent" is license text.
    .filter((line) => {
      const l = line.trim();
      if (/^\W*([Cc]opyright|COPYRIGHT)\s+(\([Cc]\)|©|\d|<|[A-Z][a-z])|^\W*(\([Cc]\)|©)\s*\d/.test(l) || /^all rights reserved\.?$/i.test(l)) return false;
      return !/^\W*(the\s+)?(mit|isc|0bsd|bsd[\w -]{0,20}|apache)\s+licen[cs]e(\s*\(\w+\))?\W*$/i.test(l);
    })
    .join("\n")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    // List labels: "1.", "(a)", "b)". Single letters go on both sides, so "a copy" stays comparable.
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
}

const pairsOf = (words: string[]) => words.slice(1).map((w, i) => `${words[i]} ${w}`);

/**
 * How much a license text differs from its reference, in word pairs: `added` pairs the reference does not have,
 * `removed` pairs of the reference the text lacks. Text before the reference's first words and after its last words
 * (a preamble, notices of bundled code) is left out. Replacing a word (the author's name for "AUTHOR") adds and
 * removes about the same number, so `added - removed` counts inserted text and `removed - added` deleted text.
 */
export function licenseChanges(text: string[], reference: string[]): { added: number; removed: number } {
  const refPairs = pairsOf(reference);
  const ref = new Set(refPairs);
  const pairs = pairsOf(text);
  // The text starts at the reference's first four word pairs and ends after its last four.
  const at = (seq: string[], from = 0) => pairs.findIndex((_, i) => i >= from && seq.every((p, k) => pairs[i + k] === p));
  const head = refPairs.slice(0, 4);
  const tail = refPairs.slice(-4);
  const start = Math.max(0, at(head));
  const end = at(tail, start);
  const own = new Set(pairs.slice(start, end < 0 ? pairs.length : end + tail.length));
  let added = 0;
  for (const p of own) if (!ref.has(p)) added++;
  let removed = 0;
  for (const p of ref) if (!own.has(p)) removed++;
  return { added, removed };
}
