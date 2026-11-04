// Keeps rule documentation in the same commit as the code it describes (CLAUDE.md, "Keep the documentation true").
// For every commit in a range, not counting merges:
//   - checks/<module>/<name>/check.ts changed       → that rule.yml changed too
//   - messages of a rule in lang/*.yml changed      → that rule.yml changed too
//   - data/<file>.yml changed                       → the commit message names <file>.yml
// A commit that knowingly leaves the docs as they are says why in a line "Docs-unchanged: <reason>".
//
//   node src/drift.ts [base] [head]     (default origin/main HEAD; an empty or unknown base checks only head)

import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";

export interface Commit {
  sha: string;
  message: string;
  /** Changed paths, renames as delete and add. */
  files: string[];
  /** Rules (module/name) whose messages in lang/*.yml changed. */
  langScopes: string[];
}

export const TRAILER = /^Docs-unchanged: *\S/m;

export function problems(c: Commit): string[] {
  if (TRAILER.test(c.message)) return [];
  const changed = new Set(c.files);
  const found = new Set<string>();
  for (const f of c.files) {
    const check = /^checks\/([^/]+\/[^/]+)\/check\.ts$/.exec(f);
    if (check && !changed.has(`checks/${check[1]}/rule.yml`)) found.add(`${f} changed, checks/${check[1]}/rule.yml not`);
    const data = /^data\/([^/]+\.yml)$/.exec(f);
    if (data && !c.message.includes(data[1])) found.add(`${f} changed, the commit message does not name ${data[1]}`);
  }
  for (const scope of c.langScopes) {
    if (!changed.has(`checks/${scope}/rule.yml`)) found.add(`messages of ${scope} in lang/ changed, checks/${scope}/rule.yml not`);
  }
  return [...found];
}

// ---------- git

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const exists = (rev: string) => {
  try {
    execFileSync("git", ["cat-file", "-e", rev], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const messagesAt = (rev: string, path: string): Record<string, unknown> =>
  exists(`${rev}:${path}`) ? ((parse(git("show", `${rev}:${path}`)) as { messages?: Record<string, unknown> })?.messages ?? {}) : {};

function readCommit(sha: string): Commit {
  const files = git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "--no-renames", sha).split("\n").filter(Boolean);
  const scopes = new Set<string>();
  for (const path of files.filter((f) => /^lang\/[^/]+\.yml$/.test(f))) {
    const before = messagesAt(`${sha}^`, path);
    const after = messagesAt(sha, path);
    for (const scope of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (isDeepStrictEqual(before[scope], after[scope])) continue;
      if (exists(`${sha}:checks/${scope}/rule.yml`) || exists(`${sha}^:checks/${scope}/rule.yml`)) scopes.add(scope);
    }
  }
  return { sha, message: git("log", "-1", "--format=%B", sha), files, langScopes: [...scopes] };
}

function commits(base: string, head: string): string[] {
  const range = base && !/^0+$/.test(base) && exists(base) ? `${base}..${head}` : `${head}^!`;
  return git("rev-list", "--no-merges", "--reverse", range).split("\n").filter(Boolean);
}

if (import.meta.main) {
  const [base = "origin/main", head = "HEAD"] = process.argv.slice(2);
  let failed = 0;
  for (const sha of commits(base, head)) {
    const c = readCommit(sha);
    const p = problems(c);
    if (!p.length) continue;
    failed++;
    console.log(`${sha.slice(0, 7)} ${c.message.split("\n")[0]}`);
    for (const line of p) console.log(`  - ${line}`);
  }
  if (failed) {
    console.log(`\n${failed} commit(s) change code or data without the docs. Update rule.yml (how, fix_hint, sources) or name the`);
    console.log(`data file in the message. If nothing in the docs needs to change, add a line "Docs-unchanged: <reason>".`);
    process.exit(1);
  }
  console.log("Docs and code changed together in every commit.");
}
