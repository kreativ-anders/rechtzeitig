import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, sep } from "node:path";
import type { Check, RepoCheck, RepoContext, ScanContext, Status } from "./sdk.ts";

const CHECKS_DIR = fileURLToPath(new URL("../checks/", import.meta.url));
const TIMEOUT = 15_000;
const STATUSES = new Set(["pass", "warn", "fail", "info", "skip"]);

export interface LoadedCheck {
  /** Folder below checks/, e.g. "legal/imprint". */
  id: string;
  check: Check | RepoCheck;
}

export interface Outcome {
  id: string;
  title: string;
  law?: string;
  status: Status | "error";
  message: string;
  details: string[];
}

/** Every checks/<category>/<name>/check.ts is one check. */
export async function loadChecks(dir = CHECKS_DIR): Promise<LoadedCheck[]> {
  const files = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(`${sep}check.ts`) && !f.includes(`${sep}fixtures${sep}`))
    .sort();
  const checks: LoadedCheck[] = [];
  for (const file of files) {
    const id = dirname(file).split(sep).join("/");
    const check = (await import(pathToFileURL(join(dir, file)).href)).default as Check | RepoCheck;
    if (!check?.title || typeof check.run !== "function") {
      throw new Error(`checks/${file} must export default defineCheck({ title, run }) or defineRepoCheck(...)`);
    }
    checks.push({ id, check });
  }
  return checks;
}

/**
 * Runs website checks when a website was scanned and repository checks when a repository was scanned.
 * Each check runs on its own: one that throws, hangs or returns nothing becomes "error" and the others still run.
 */
export async function runChecks(checks: LoadedCheck[], targets: { web?: ScanContext; repo?: RepoContext }): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { id, check } of checks) {
    const target = check.repo ? targets.repo : targets.web;
    if (!target) continue;
    const base = { id, title: check.title, law: check.law };
    try {
      const result = await Promise.race([
        (check.run as (t: typeof target) => ReturnType<Check["run"]>)(target),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${TIMEOUT / 1000}s`)), TIMEOUT).unref()),
      ]);
      if (!result || !STATUSES.has(result.status)) throw new Error("check returned no result");
      outcomes.push({ ...base, status: result.status, message: result.message, details: result.details ?? [] });
    } catch (e) {
      outcomes.push({ ...base, status: "error", message: (e as Error).message, details: [] });
    }
  }
  return outcomes;
}
