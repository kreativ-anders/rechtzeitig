// Mutation test for the checks. Makes one small change at a time to what a rule decides by (its check.ts,
// the word patterns and data lists it reads, its thresholds) and runs that rule's test.ts. A change the
// tests do not notice "survives" and points to a gap in the tests. Works on copies in a temporary folder.
//
//   npm run mutate                      every rule
//   npm run mutate -- legal/imprint     rules whose path contains one of the words
//   npm run mutate -- --jobs 4 --json out.json
//   npm run mutate -- --list            only print the mutants

import { spawn } from "node:child_process";
import { cpSync, globSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { isMap, isPair, isScalar, parseDocument, visit, type Document } from "yaml";

const ROOT = new URL("../", import.meta.url).pathname;
const TIMEOUT = 120_000;
const MAX_ENTRIES = 10;

interface Mutant { rule: string; file: string; kind: string; where: string; text: string }

// ---- check.ts: operators, statuses, literals, regular expressions -------------------------------------

/** Spans of code outside comments, strings and regex literals, plus the regex literals. */
function tokens(src: string): { code: Array<[number, number]>; regexes: Array<[number, number]> } {
  const code: Array<[number, number]> = [];
  const regexes: Array<[number, number]> = [];
  let start = 0;
  let i = 0;
  let prev = "";
  const cut = (end: number) => end > start && code.push([start, end]);
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === "//" || two === "/*") {
      cut(i);
      i = two === "//" ? src.indexOf("\n", i) : src.indexOf("*/", i) + 2;
      if (i < 0 || i === 1) i = src.length;
      start = i;
    } else if (c === '"' || c === "'" || c === "`") {
      cut(i);
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      start = ++i;
      prev = "a";
    } else if (c === "/" && /^([=(,:[!&|?{};]|return|)$/.test(prev)) {
      cut(i);
      const from = i;
      let inClass = false;
      for (i++; i < src.length && (src[i] !== "/" || inClass); i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
      }
      for (i++; /[a-z]/.test(src[i] ?? ""); i++);
      regexes.push([from, i]);
      start = i;
      prev = "a";
    } else if (/\w/.test(c)) {
      const word = src.slice(i).match(/^\w+/)![0];
      prev = word === "return" ? "return" : "a";
      i += word.length;
    } else {
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  cut(src.length);
  return { code, regexes };
}

/** Every regex with one alternative of one group left out, and without its i flag. */
function regexMutants(re: string): Array<[string, string]> {
  const body = re.slice(1, re.lastIndexOf("/"));
  const flags = re.slice(re.lastIndexOf("/") + 1);
  const out: Array<[string, string]> = [];
  if (flags.includes("i")) out.push([`/${body}/${flags.replace("i", "")}`, "without the i flag"]);
  // Groups as lists of alternative spans; index 0 is the whole pattern.
  const stack: Array<{ alts: Array<[number, number]>; from: number }> = [{ alts: [], from: 0 }];
  const groups: Array<Array<[number, number]>> = [];
  let inClass = false;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") inClass = true;
    else if (c === "(") {
      const skip = body.slice(i + 1).match(/^\?(<?[=!]|:|<[\w]+>)?/)?.[0].length ?? 0;
      stack.push({ alts: [], from: i + 1 + skip });
    } else if (c === "|") {
      const g = stack.at(-1)!;
      g.alts.push([g.from, i]);
      g.from = i + 1;
    } else if (c === ")" || i === body.length) {
      const g = stack.pop();
      if (!g) break;
      g.alts.push([g.from, i]);
      if (g.alts.length > 1) groups.push(g.alts);
    }
  }
  for (const alts of groups) {
    alts.forEach(([a, b], k) => {
      // Drop the alternative together with one of its separators.
      const [x, y] = k === 0 ? [a, alts[1][0]] : [alts[k - 1][1], b];
      out.push([`/${body.slice(0, x)}${body.slice(y)}/${flags}`, `without alternative "${body.slice(a, b)}"`]);
    });
  }
  return out;
}

const SWAPS: Array<[RegExp, string, string]> = [
  [/===/g, "!==", "=== to !=="],
  [/!==/g, "===", "!== to ==="],
  [/ < /g, " >= ", "< to >="],
  [/ <= /g, " > ", "<= to >"],
  [/ > /g, " <= ", "> to <="],
  [/ >= /g, " < ", ">= to <"],
  [/&&/g, "||", "&& to ||"],
  [/\|\|/g, "&&", "|| to &&"],
  [/\.some\(/g, ".every(", "some to every"],
  [/\.every\(/g, ".some(", "every to some"],
  [/\btrue\b/g, "false", "true to false"],
  [/\bfalse\b/g, "true", "false to true"],
  [/(?<![\w)\]!])!(?!=)/g, "", "drop !"],
  [/\breturn (pass|warn|fail|info|skip)\(/g, "", "status"],
  [/(?<![\w.])(\d+)(?![\w.])/g, "", "number"],
];
const OTHER: Record<string, string> = { pass: "fail", fail: "pass", warn: "pass", info: "warn", skip: "pass" };
// Status helpers under names no check uses, so a swapped status needs no change to the check's imports.
const STATUS_IMPORT = 'import { pass as $pass, warn as $warn, fail as $fail, info as $info, skip as $skip } from "../../../src/sdk.ts";\n';

function codeMutants(rule: string, file: string): Mutant[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  const { code, regexes } = tokens(src);
  const line = (at: number) => `${file}:${src.slice(0, at).split("\n").length}`;
  const out: Mutant[] = [];
  for (const [from, to] of code) {
    const part = src.slice(from, to);
    for (const [re, by, kind] of SWAPS) {
      for (const m of part.matchAll(re)) {
        const at = from + m.index;
        if (/^import /m.test(src.slice(src.lastIndexOf("\n", at) + 1, at + 1))) continue;
        let repl = by;
        let k = kind;
        if (kind === "status") { repl = `return $${OTHER[m[1]]}(`; k = `${m[1]} to ${OTHER[m[1]]}`; }
        if (kind === "number") { repl = String(Number(m[1]) + 1); k = `${m[1]} to ${repl}`; }
        const text = src.slice(0, at) + repl + src.slice(at + m[0].length);
        out.push({ rule, file, kind: k, where: line(at), text: kind === "status" ? STATUS_IMPORT + text : text });
      }
    }
  }
  for (const [from, to] of regexes) {
    for (const [re, kind] of regexMutants(src.slice(from, to))) {
      out.push({ rule, file, kind: `regex ${src.slice(from, to).slice(0, 40)}: ${kind}`, where: line(from), text: src.slice(0, from) + re + src.slice(to) });
    }
  }
  return out;
}

// ---- YAML: word patterns, data lists, thresholds ---------------------------------------------------------

/** One mutant per change `edit` makes to a fresh copy of the document; edit returns a label per change. */
function yamlMutants(rule: string, file: string, edit: (doc: Document, n: number) => string | undefined): Mutant[] {
  const out: Mutant[] = [];
  for (let n = 0; ; n++) {
    const doc = parseDocument(readFileSync(join(ROOT, file), "utf8"));
    const kind = edit(doc, n);
    if (kind === undefined) return out;
    out.push({ rule, file, kind, where: file, text: doc.toString() });
  }
}

/**
 * The n-th list entry in the sequences picked by `where` (path → yes), removed. A list of more than
 * MAX_ENTRIES counts once, emptied: a test cannot be expected to name every service or pattern.
 */
function dropEntry(where: (path: string) => boolean) {
  return (doc: Document, n: number): string | undefined => {
    let seen = 0;
    let label: string | undefined;
    visit(doc, {
      Seq(_, node, path) {
        const keys = path.filter(isPair).map((p) => String(isScalar(p.key) ? p.key.value : ""));
        if (!where(keys.join("."))) return;
        if (node.items.length > MAX_ENTRIES) {
          if (seen++ !== n) return;
          label = `${keys.join(".")}: emptied (${node.items.length} entries)`;
          node.items = [];
          return visit.BREAK;
        }
        for (let i = 0; i < node.items.length; i++, seen++) {
          if (seen !== n) continue;
          const item = node.items[i];
          label = `${keys.join(".")}: without ${JSON.stringify(isScalar(item) ? item.value : doc.createNode(item).toJSON()).slice(0, 60)}`;
          node.items.splice(i, 1);
          return visit.BREAK;
        }
      },
    });
    return label;
  };
}

function wordMutants(rule: string, src: string): Mutant[] {
  const strings = new Set([...src.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  return globSync("lang/*.yml", { cwd: ROOT }).flatMap((file) =>
    yamlMutants(rule, file, dropEntry((p) => /^(links|text)\./.test(p) && strings.has(p.split(".")[1]))),
  );
}

function dataMutants(rule: string, src: string): Mutant[] {
  const files = [...src.matchAll(/"(data\/[\w-]+\.yml)"/g)].map((m) => m[1]).filter((f) => f !== "data/thresholds.yml");
  // Only the parts the check names, so a shared file does not count against every rule that reads it.
  const words = new Set(src.match(/\w+/g));
  return [...new Set(files)].flatMap((file) => yamlMutants(rule, file, dropEntry((p) => !p || words.has(p.split(".")[0]))));
}

function thresholdMutants(rule: string): Mutant[] {
  return yamlMutants(rule, "data/thresholds.yml", (doc, n) => {
    const section = doc.get(rule, true);
    if (!isMap(section)) return undefined;
    let seen = 0;
    let label: string | undefined;
    visit(section, {
      Scalar(_, node) {
        if (typeof node.value !== "number") return;
        for (const factor of [2, 0.5]) {
          if (seen++ !== n) continue;
          const old = node.value as number;
          const next = Number.isInteger(old) ? Math.round(old * factor) || old + 1 : old * factor;
          label = `threshold ${old} to ${next}`;
          node.value = next;
          return visit.BREAK;
        }
      },
    });
    return label;
  });
}

// ---- running ---------------------------------------------------------------------------------------------

function copyRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rechtzeitig-mutate-"));
  cpSync(ROOT, dir, { recursive: true, filter: (p) => !/\/(node_modules|\.git|\.claude)(\/|$)/.test(p.slice(ROOT.length - 1)) });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
  return dir;
}

// Word patterns also have their own examples; a mutant there may die in either test.
const SHARED: Record<string, string[]> = { lang: ["src/lang-examples.test.ts"] };

function runTest(dir: string, rule: string, file = ""): Promise<boolean> {
  const tests = [`checks/${rule}/test.ts`, ...(SHARED[file.split("/")[0]] ?? [])];
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--test", "--test-reporter=dot", ...tests], { cwd: dir, stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT);
    child.on("exit", (code) => { clearTimeout(timer); done(code === 0); });
  });
}

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const jobs = Number(flag("--jobs") ?? Math.max(1, availableParallelism() - 1));
const jsonOut = flag("--json");
const list = args.includes("--list") && args.splice(args.indexOf("--list"), 1).length > 0;
const rules = globSync("checks/*/*/check.ts", { cwd: ROOT })
  .map((f) => f.slice("checks/".length, -"/check.ts".length))
  .filter((r) => !args.length || args.some((a) => r.includes(a)))
  .sort();

const mutants = rules.flatMap((rule) => {
  const file = `checks/${rule}/check.ts`;
  const src = readFileSync(join(ROOT, file), "utf8");
  return [...codeMutants(rule, file), ...wordMutants(rule, src), ...dataMutants(rule, src), ...thresholdMutants(rule)];
});
console.log(`${mutants.length} mutants in ${rules.length} rules, ${jobs} jobs`);
if (list) {
  for (const m of mutants) console.log(`${m.where}  ${m.kind}`);
  process.exit(0);
}

const results: Array<Mutant & { killed: boolean }> = [];
const copies = Array.from({ length: jobs }, copyRepo);
/** Runs `work` on each item, one item per copy at a time. */
async function pool<T>(items: T[], work: (dir: string, item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(copies.map(async (dir) => { while (next < items.length) await work(dir, items[next++]); }));
}
try {
  await pool(rules, async (dir, rule) => {
    if (!(await runTest(dir, rule))) throw new Error(`checks/${rule}/test.ts fails without a mutation`);
  });
  await pool(mutants, async (dir, m) => {
    const original = readFileSync(join(dir, m.file), "utf8");
    writeFileSync(join(dir, m.file), m.text);
    const killed = !(await runTest(dir, m.rule, m.file));
    writeFileSync(join(dir, m.file), original);
    results.push({ ...m, killed });
    if (!killed) console.log(`survived  ${m.where}  ${m.kind}`);
  });
} finally {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
}

console.log("\nrule | killed | total | score");
for (const rule of rules) {
  const mine = results.filter((r) => r.rule === rule);
  const killed = mine.filter((r) => r.killed).length;
  console.log(`${rule} | ${killed} | ${mine.length} | ${mine.length ? Math.round((100 * killed) / mine.length) : 100}%`);
}
const killed = results.filter((r) => r.killed).length;
console.log(`all | ${killed} | ${results.length} | ${Math.round((100 * killed) / results.length)}%`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results.map(({ text: _, ...r }) => r), null, 1));
