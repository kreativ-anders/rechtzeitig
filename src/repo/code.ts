// Source code of the repository for the code checks: which files are code in which language, which are tests,
// which run in the browser, and line-by-line pattern matching. Paths and languages come
// from data/code-paths.yml, the patterns from each check's data file (data/insecure-code.yml, data/code-quality.yml).

import { loadYaml } from "../data.ts";
import type { Finding, Params, RepoContext } from "../sdk.ts";

export const LANGUAGES = ["js", "python", "go", "php", "ruby", "shell", "env", "config"] as const;
export type Language = (typeof LANGUAGES)[number];

interface PathData {
  languages: Record<Language, { extensions?: string[]; names?: string[]; paths?: string[]; comment: string[] }>;
  skip: string[];
  tests: string[];
  client: { directive: string; components: string; server_names: string; vite_config: string };
}
const DATA = loadYaml<PathData>("data/code-paths.yml");
const LIMITS = loadYaml<{ "source-code": { directive_lines: number; max_line_chars: number } }>("data/thresholds.yml")["source-code"];

const any = (list: string[]) => new RegExp(list.join("|"));
const SKIP = any(DATA.skip);
const TESTS = any(DATA.tests);
const BY_PATH = LANGUAGES.map((l) => ({ language: l, re: DATA.languages[l].paths?.length ? any(DATA.languages[l].paths!) : undefined }));
const DIRECTIVE = new RegExp(DATA.client.directive);
const USE_SERVER = /^\s*["']use server["']/;
const COMPONENT = new RegExp(DATA.client.components);
const SERVER = new RegExp(DATA.client.server_names);
const VITE = new RegExp(DATA.client.vite_config);

/** Language of a path from data/code-paths.yml, or undefined when it is no code the checks read. */
export function languageOf(path: string): Language | undefined {
  const name = path.split("/").pop() ?? "";
  for (const { language, re } of BY_PATH) if (re?.test(path)) return language;
  for (const l of LANGUAGES) if (DATA.languages[l].names?.includes(name)) return l;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  return ext ? LANGUAGES.find((l) => DATA.languages[l].extensions?.includes(ext)) : undefined;
}

/** true for a test file (data/code-paths.yml `tests`). */
export const isTest = (path: string) => TESTS.test(path);
/** true for a path no code check reads: vendored, built, generated, docs, examples, fixtures (data/code-paths.yml `skip`). */
export const isSkipped = (path: string) => SKIP.test(path);

export interface CodeFile {
  file: string;
  language: Language;
}

/**
 * Tracked code files in a known language, without skipped paths. `tests`: "skip" (default) leaves test files out,
 * "only" keeps only them.
 */
export function codeFiles(repo: RepoContext, { tests = "skip" }: { tests?: "skip" | "only" } = {}): CodeFile[] {
  return repo.files.flatMap((file) => {
    if (isSkipped(file) || isTest(file) !== (tests === "only")) return [];
    const language = languageOf(file);
    return language ? [{ file, language }] : [];
  });
}

/**
 * true when the file runs in the browser: a "use client" component, a Vue or Svelte component, or a file under
 * `src/` next to a Vite config, unless its path names a server part (data/code-paths.yml `client`).
 */
export function isClientFile(repo: RepoContext, file: string): boolean {
  if (languageOf(file) !== "js" || SERVER.test(file)) return false;
  const head = (repo.read(file) ?? "").split("\n", LIMITS.directive_lines);
  if (head.some((l) => USE_SERVER.test(l))) return false;
  if (head.some((l) => DIRECTIVE.test(l)) || COMPONENT.test(file)) return true;
  return repo.files.some((f) => VITE.test(f) && file.startsWith(`${f.slice(0, f.lastIndexOf("/") + 1)}src/`));
}

/** One pattern of a code check, from its data file. */
export interface CodePattern {
  /** Message key of a find, in the check's messages. A named group `name` becomes the parameter {name}. */
  key: string;
  pattern: string;
  /** Regular expression flags, e.g. "i". */
  flags?: string;
  /** Only in files whose path matches. */
  paths?: string;
  /** Not in files whose path matches. */
  not_paths?: string;
  /** Not a find when the same line also matches this. */
  unless?: string;
  /** Not a find when the file matches this anywhere (a setting elsewhere in the file that makes the line safe). */
  unless_file?: string;
  /** Also in lines that are only a comment (data/code-paths.yml `comment`). */
  comments?: boolean;
  /** Matched on the whole file, so it may span lines, instead of line by line. */
  whole?: boolean;
  /** How sure a find is: fail (default) or warn. The check decides what it does with it. */
  level?: "fail" | "warn";
}
/** Patterns by language (data/code-paths.yml `languages`). */
export type PatternSet = Partial<Record<Language, CodePattern[]>>;

interface Compiled extends CodePattern {
  re: RegExp;
  pathRe?: RegExp;
  notRe?: RegExp;
  unlessRe?: RegExp;
  unlessFileRe?: RegExp;
}
const compiled = new WeakMap<CodePattern[], Compiled[]>();
function compile(list: CodePattern[]): Compiled[] {
  let c = compiled.get(list);
  if (!c) {
    c = list.map((p) => ({
      ...p,
      re: new RegExp(p.pattern, `${(p.flags ?? "").replace("g", "")}${p.whole ? "g" : ""}`),
      pathRe: p.paths ? new RegExp(p.paths) : undefined,
      notRe: p.not_paths ? new RegExp(p.not_paths) : undefined,
      unlessRe: p.unless ? new RegExp(p.unless, p.flags?.replace("g", "")) : undefined,
      unlessFileRe: p.unless_file ? new RegExp(p.unless_file, p.flags?.replace("g", "")) : undefined,
    }));
    compiled.set(list, c);
  }
  return c;
}

export interface CodeFind extends Finding {
  file: string;
  line: number;
  key: string;
  language: Language;
  level: "fail" | "warn";
}

const isComment = (line: string, language: Language) => {
  const t = line.trimStart();
  return DATA.languages[language].comment.some((c) => t.startsWith(c));
};

/**
 * Every find of the patterns in the files: at most one per file and line (the first pattern that matches), in file order.
 * Lines longer than `source-code.max_line_chars` (data/thresholds.yml) are left out, they are minified or data.
 */
export function findInCode(repo: RepoContext, files: CodeFile[], set: PatternSet): CodeFind[] {
  const finds: CodeFind[] = [];
  for (const { file, language } of files) {
    const patterns = compile(set[language] ?? []).filter((p) => (!p.pathRe || p.pathRe.test(file)) && !p.notRe?.test(file));
    if (!patterns.length) continue;
    const text = repo.read(file);
    if (!text) continue;
    const lines = text.split("\n");
    const active = patterns.filter((p) => !p.unlessFileRe?.test(text));
    const seen = new Set<string>();
    const add = (p: Compiled, i: number, m: RegExpMatchArray) => {
      const line = lines[i] ?? "";
      if (line.length > LIMITS.max_line_chars) return;
      if (!p.comments && isComment(line, language)) return;
      if (p.unlessRe?.test(line)) return;
      const id = String(i);
      if (seen.has(id)) return;
      seen.add(id);
      const params: Params = m.groups?.name ? { name: m.groups.name } : {};
      finds.push({ file, line: i + 1, key: p.key, language, level: p.level ?? "fail", ...(Object.keys(params).length ? { params } : {}) });
    };
    for (const p of active) {
      if (p.whole) {
        for (const m of text.matchAll(p.re)) add(p, text.slice(0, m.index).split("\n").length - 1, m);
        continue;
      }
      lines.forEach((line, i) => {
        if (line.length > LIMITS.max_line_chars) return;
        const m = p.re.exec(line);
        if (m) add(p, i, m);
      });
    }
  }
  return finds.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

/** Findings for the report: file, line, key and params, without the language. */
export const toFindings = (finds: CodeFind[]): Finding[] => finds.map(({ language: _l, level: _v, ...f }) => f);
