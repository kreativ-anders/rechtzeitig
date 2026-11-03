import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, sep } from "node:path";
import { loadRule, type Rule } from "./rules.ts";
import type { Check, RepoCheck, RepoContext, ScanContext, Status } from "./sdk.ts";

const CHECKS_DIR = fileURLToPath(new URL("../checks/", import.meta.url));
const TIMEOUT = 15_000;
const STATUSES = new Set(["pass", "warn", "fail", "info", "skip"]);

export interface LoadedCheck {
  /** Folder below checks/, e.g. "legal/imprint". Its first part is the module. */
  id: string;
  rule: Rule;
  check: Check | RepoCheck;
}

export interface Outcome {
  id: string;
  rule: Rule;
  status: Status | "error";
  message: string;
  details: string[];
}

/** Every checks/<module>/<name>/ with check.ts and rule.yml is one check. */
export async function loadChecks(dir = CHECKS_DIR): Promise<LoadedCheck[]> {
  const files = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(`${sep}check.ts`) && !f.includes(`${sep}fixtures${sep}`))
    .sort();
  const checks: LoadedCheck[] = [];
  for (const file of files) {
    const folder = dirname(file);
    const ruleFile = join(dir, folder, "rule.yml");
    if (!existsSync(ruleFile)) throw new Error(`checks/${folder}/rule.yml is missing`);
    const check = (await import(pathToFileURL(join(dir, file)).href)).default as Check | RepoCheck;
    if (typeof check?.run !== "function") throw new Error(`checks/${file} must export default defineCheck({ run }) or defineRepoCheck({ run })`);
    checks.push({ id: folder.split(sep).join("/"), rule: loadRule(ruleFile), check });
  }
  return checks;
}

/** Keeps only checks of the given modules ("legal", "privacy", "security", "repo", ...). Empty = all. */
export const selectModules = (checks: LoadedCheck[], modules: string[]) =>
  modules.length ? checks.filter((c) => modules.includes(c.id.split("/")[0])) : checks;

/**
 * Runs website checks when a website was scanned and repository checks when a repository was scanned.
 * Each check runs on its own: one that throws, hangs or returns nothing becomes "error" and the others still run.
 */
export async function runChecks(checks: LoadedCheck[], targets: { web?: ScanContext; repo?: RepoContext }): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { id, rule, check } of checks) {
    const target = check.repo ? targets.repo : targets.web;
    if (!target) continue;
    try {
      const result = await Promise.race([
        (check.run as (t: typeof target) => ReturnType<Check["run"]>)(target),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${TIMEOUT / 1000}s`)), TIMEOUT).unref()),
      ]);
      if (!result || !STATUSES.has(result.status)) throw new Error("check returned no result");
      outcomes.push({ id, rule, status: result.status, message: result.message, details: result.details ?? [] });
    } catch (e) {
      outcomes.push({ id, rule, status: "error", message: (e as Error).message, details: [] });
    }
  }
  return outcomes;
}
