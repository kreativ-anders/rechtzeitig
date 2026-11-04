import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, sep } from "node:path";
import { loadRule, TOKEN_INPUTS, type Rule, type TokenInput } from "./rules.ts";
import { timeoutAfter } from "./deadline.ts";
import { errorMessage } from "./text.ts";
import { STATUSES, type Check, type Finding, type Msg, type RepoCheck, type RepoContext, type Result, type ScanContext, type Status } from "./sdk.ts";

const CHECKS_DIR = fileURLToPath(new URL("../checks/", import.meta.url));
const TIMEOUT = 15_000;

/** Every status an outcome can have, most urgent first. "error" means the check itself broke. */
export const OUTCOMES = ["fail", "error", "warn", "info", "pass", "skip"] as const satisfies ReadonlyArray<Status | "error">;
export type OutcomeStatus = (typeof OUTCOMES)[number];

export interface LoadedCheck {
  /** Folder below checks/, e.g. "legal/imprint". Its first part is the module. */
  id: string;
  rule: Rule;
  check: Check | RepoCheck;
}

export interface Outcome {
  id: string;
  rule: Rule;
  status: OutcomeStatus;
  /** Rendered in the report language by src/messages.ts. */
  message: Msg | string;
  details: Array<Finding | string>;
}

/** Module of a check id: "legal/imprint" → "legal". */
export const moduleOf = (id: string) => id.split("/")[0];

/** Imports a check.ts and makes sure it exports a check. */
export async function importCheck<T extends Check | RepoCheck = Check | RepoCheck>(file: string): Promise<T> {
  const check = (await import(pathToFileURL(file).href)).default as T | undefined;
  if (typeof check?.run !== "function") throw new Error(`${file} must export default defineCheck({ run }) or defineRepoCheck({ run })`);
  return check;
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
    checks.push({ id: folder.split(sep).join("/"), rule: loadRule(ruleFile), check: await importCheck(join(dir, file)) });
  }
  return checks;
}

/** Keeps only checks of the given modules ("legal", "privacy", "security", "repo", ...). Empty = all. */
export const selectModules = (checks: LoadedCheck[], modules: string[]) =>
  modules.length ? checks.filter((c) => modules.includes(moduleOf(c.id))) : checks;

/** The check bound to its target, or undefined when that target was not scanned. */
function bind(check: Check | RepoCheck, targets: { web?: ScanContext; repo?: RepoContext }): (() => Result | Promise<Result>) | undefined {
  if (check.repo) {
    const repo = targets.repo;
    return repo && (() => check.run(repo));
  }
  const web = targets.web;
  return web && (() => check.run(web));
}

const isStatus = (s: unknown): s is Status => (STATUSES as readonly unknown[]).includes(s);

/** The skip result for a rule whose token input is not set, or undefined when all are set. */
function missingToken(rule: Rule, tokens: readonly TokenInput[]): Result | undefined {
  const input = rule.requires?.find((r) => !tokens.includes(r));
  if (!input) return undefined;
  const { secret, service } = TOKEN_INPUTS[input];
  return { status: "skip", message: { key: "needs_token", params: { input, secret, service } } };
}

/**
 * Runs website checks when a website was scanned and repository checks when a repository was scanned.
 * Each check runs on its own: one that throws, hangs or returns nothing becomes "error" and the others still run.
 * A rule that `requires` a token input not in `tokens` is skipped without running.
 */
export async function runChecks(
  checks: LoadedCheck[],
  targets: { web?: ScanContext; repo?: RepoContext },
  tokens: readonly TokenInput[] = [],
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { id, rule, check } of checks) {
    const run = bind(check, targets);
    if (!run) continue;
    const skipped = missingToken(rule, tokens);
    if (skipped) {
      outcomes.push({ id, rule, status: "skip", message: skipped.message, details: [] });
      continue;
    }
    const [deadline, stop] = timeoutAfter(TIMEOUT, `timed out after ${TIMEOUT / 1000}s`);
    try {
      const result = await Promise.race([run(), deadline]);
      if (!isStatus(result?.status)) throw new Error("check returned no result");
      outcomes.push({ id, rule, status: result.status, message: result.message, details: result.details ?? [] });
    } catch (e) {
      outcomes.push({ id, rule, status: "error", message: errorMessage(e), details: [] });
    } finally {
      stop();
    }
  }
  return outcomes;
}
