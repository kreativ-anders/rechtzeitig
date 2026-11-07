import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, sep } from "node:path";
import { loadRule, switchSpec, type Rule, type Switch } from "./rules.ts";
import { timeoutAfter } from "./deadline.ts";
import { errorMessage } from "./text.ts";
import { STATUSES, type Check, type Finding, type Msg, type RepoCheck, type RepoContext, type ScanContext, type Status } from "./sdk.ts";

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

/**
 * Why a check was skipped. `target`: no URL or no checkout; `module`: left out by the input `modules`;
 * `switch`: an input in `requires` is off; `data`: the check ran but found nothing it could read.
 */
export type Because =
  | { kind: "target"; missing: "url" | "repository" }
  | { kind: "module"; modules: string[] }
  | { kind: "switch"; input: Switch }
  | { kind: "data" };

export interface Outcome {
  id: string;
  rule: Rule;
  status: OutcomeStatus;
  /** Rendered in the report language by src/messages.ts. */
  message: Msg | string;
  details: Array<Finding | string>;
  /** Set for every skip. */
  because?: Because;
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

type Targets = { web?: ScanContext; repo?: RepoContext };

/** Why a check cannot start, with its skip message from `messages.common`; undefined when it can. */
function cannotRun(id: string, rule: Rule, check: Check | RepoCheck, targets: Targets, enabled: readonly Switch[], modules: string[]): { because: Because; message: Msg } | undefined {
  if (modules.length && !modules.includes(moduleOf(id))) {
    return { because: { kind: "module", modules }, message: { key: "not_run_module", params: { module: moduleOf(id), modules: modules.join(", ") } } };
  }
  if (check.repo && !targets.repo) return { because: { kind: "target", missing: "repository" }, message: { key: "not_run_repository" } };
  if (!check.repo && !targets.web) return { because: { kind: "target", missing: "url" }, message: { key: "not_run_url" } };
  // The first input in `requires` that is off; its message is `messages.common.switch_<input>`.
  const input = rule.requires?.find((r) => !enabled.includes(r));
  if (!input) return undefined;
  const s = switchSpec(input);
  return { because: { kind: "switch", input }, message: { key: `switch_${input}`, params: { input, secret: s.secret ?? "", service: s.service ?? "" } } };
}

const isStatus = (s: unknown): s is Status => (STATUSES as readonly unknown[]).includes(s);

/**
 * Runs every check and returns one outcome per check. A check that cannot run (no URL, no checkout, left out
 * by `modules`, a switch off) is a skip with `because`, never left out, so the report shows what was not looked at.
 */
export async function runChecks(checks: LoadedCheck[], targets: Targets, enabled: readonly Switch[] = [], modules: string[] = []): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { id, rule, check } of checks) {
    const not = cannotRun(id, rule, check, targets, enabled, modules);
    if (not) {
      outcomes.push({ id, rule, status: "skip", message: not.message, details: [], because: not.because });
      continue;
    }
    const run = () => (check.repo ? check.run(targets.repo!) : check.run(targets.web!));
    const [deadline, stop] = timeoutAfter(TIMEOUT, `timed out after ${TIMEOUT / 1000}s`);
    try {
      const result = await Promise.race([run(), deadline]);
      if (!isStatus(result?.status)) throw new Error("check returned no result");
      const because: Because | undefined = result.status === "skip" ? { kind: "data" } : undefined;
      outcomes.push({ id, rule, status: result.status, message: result.message, details: result.details ?? [], ...(because && { because }) });
    } catch (e) {
      outcomes.push({ id, rule, status: "error", message: errorMessage(e), details: [] });
    } finally {
      stop();
    }
  }
  return outcomes;
}
