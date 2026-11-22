// Command line entry. Used by action.yml and for local runs:
//   node src/main.ts --url https://example.de --repo .

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { CLI_OPTIONS } from "./options.ts";
import { scan, VERSION } from "./scan.ts";
import { scanRepo } from "./repo/scan.ts";
import { toCycloneDx } from "./repo/sbom.ts";
import { toSarif, workflowFile } from "./sarif.ts";
import { loadChecks, OUTCOMES, runChecks, scopeOf, selectModules, type OutcomeStatus } from "./runner.ts";
import { SWITCHES, switchSpec, type Switch } from "./rules.ts";
import { errorMessage } from "./text.ts";
import { applySuppressions, loadSuppressions } from "./suppress.ts";
import { md, plain, repoName, toAnnotations, toCounts, toSummary, toText, withoutCommands, type Report } from "./report.ts";
import { toReportJson } from "./report-json.ts";

const FAIL_ON: Record<string, OutcomeStatus[]> = {
  never: [],
  fail: ["fail", "error"],
  warn: ["fail", "error", "warn"],
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: CLI_OPTIONS,
});
// Runs without the Run workflow dialog (schedule, push) pass every `inputs.*` as "", so empty means the default.
// url and repo have no default: empty there means "do not scan the site" or "no checkout".
for (const [name, spec] of Object.entries(CLI_OPTIONS)) {
  const key = name as keyof typeof values;
  if ("default" in spec && typeof values[key] === "string" && !(values[key] as string).trim()) (values as Record<string, unknown>)[key] = spec.default;
}

let url = (values.url || positionals[0] || "").trim();
if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
const failOn = values["fail-on"] || "fail";
if (!FAIL_ON[failOn]) exit(`fail-on must be one of: ${Object.keys(FAIL_ON).join(", ")}`);
const onGitHub = !!process.env.GITHUB_ACTIONS;
// What the run page shows: everything outside GitHub and for private or internal repositories; only counts when
// the repository is public or the event does not say, so a missing field never makes findings public.
const visible = !onGitHub || repositoryIsPrivate();
const modules = values.modules!.split(",").map((m) => m.trim()).filter(Boolean);

const startedAt = new Date().toISOString();
// Inputs that are on (src/rules.ts SWITCHES): a secret is set, or a true/false input is not at its "off" value.
const isOn = (input: Switch): boolean => {
  const s = switchSpec(input);
  if (s.secret) return !!process.env[s.secret];
  const value = (values as Record<string, string | undefined>)[input];
  return s.default ? value !== "false" : value === "true";
};
const enabled = (Object.keys(SWITCHES) as Switch[]).filter(isOn);
const warnings: string[] = [];
const allChecks = await loadChecks();
const checks = selectModules(allChecks, modules);
// A check of both scopes needs both scans.
const wantsRepo = checks.some((c) => scopeOf(c.check) !== "website");
const wantsWeb = checks.some((c) => scopeOf(c.check) !== "repository");
// Opt-in: without vulnerabilities=true nothing goes to api.osv.dev; the vulnerabilities rule then skips.
const osv = enabled.includes("vulnerabilities");
// A scan that breaks (no browser, no sandbox, unreadable repository) ends with a message, not a stack trace.
const failed = (e: unknown) => exit(errorMessage(e));
const repo = values.repo?.trim() && wantsRepo ? await scanRepo(values.repo, { osv }).catch(failed) : undefined;
const web = url && wantsWeb
  ? await scan(url, {
      subscriptions: enabled.includes("subscriptions"),
      sales: enabled.includes("sales"),
      maxPages: Number(values["max-pages"]) || 10,
      ipinfoToken: process.env.IPINFO_TOKEN || undefined,
      // Opt-in: without green-hosting=true nothing goes to the Green Web Foundation; the rule then skips.
      greenHosting: enabled.includes("green-hosting"),
      unsandboxed: values["require-sandbox"] === "false",
      // On GitHub Actions a url from event data must not reach the runner's network unless allow-private-url is true.
      allowPrivateUrl: !onGitHub || values["allow-private-url"] === "true",
      onWarning: (w) => warnings.push(w),
    }).catch(failed)
  : undefined;
if (!web && !repo) exit("Nothing to scan. Set a URL, or check out the repository before this step.");

// Every check gets an outcome; those that cannot run are skips that say why. Rules turned off in
// .github/rechtzeitig.yml still run and become "suppressed" with their reason; that file is read from the checkout
// also when no repository check runs, and an invalid entry turns nothing off.
const root = repo?.root ?? (values.repo?.trim() || undefined);
const outcomes = applySuppressions(await runChecks(allChecks, { web, repo }, enabled, modules), root ? loadSuppressions(root) : undefined);
const report: Report = { web, repo, outcomes, version: VERSION, startedAt, onGitHub, warnings };
const log = (text: string) => console.log(onGitHub ? withoutCommands(text) : text);
// Scanned repository's folder relative to the workspace, for annotations and SARIF.
const base = repo ? relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), resolve(repo.root)).split(sep).join("/") : "";
const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
// The SARIF file and the report JSON (--report) are written whatever the visibility, outside the artifact folder:
// SARIF goes to the Security tab, the JSON stays on the runner for later steps of the job (action output report).
if (values.sarif) write(values.sarif, JSON.stringify(toSarif(report, { base, anchor: workflowFile() }), null, 2));
const json = JSON.stringify(toReportJson(outcomes, {
  version: VERSION, startedAt, base,
  target: { url: web?.url, repository: repo && repoName(repo.root), ...(web && { languages: web.languages, languages_from: "page" as const }) },
  ...(repo && { coverage: repo.coverage }),
}), null, 2);
if (values.report) {
  write(values.report, json);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `report=${resolve(values.report)}\n`);
}
let summary: string | undefined;
if (visible) {
  // The artifact: report JSON and SBOM.
  write(`${values.out}.json`, json);
  if (repo) write(join(dirname(values.out!), "rechtzeitig-sbom.cdx.json"), toCycloneDx(repo, VERSION));
  log(toText(report));
  // Annotations for findings in files, outside the stop-commands block above; src/report.ts escapes every value.
  if (onGitHub && repo) for (const line of toAnnotations(report, base)) console.log(line);
  summary = toSummary(report);
} else {
  // No files, so no artifact: the SBOM lists vulnerabilities, the findings their places.
  log(toCounts(report, "text"));
  summary = toCounts(report, "md");
}

const failing = outcomes.some((o) => FAIL_ON[failOn].includes(o.status));
// The most urgent outcome decides: fail (also for errors), warn, otherwise pass.
const worst = OUTCOMES.find((s) => outcomes.some((o) => o.status === s));
const result = worst === "fail" || worst === "error" ? "fail" : worst === "warn" ? "warn" : "pass";
if (summary && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
process.exit(failing ? 1 : 0);

function exit(message: string): never {
  console.error(`rechtzeitig: ${plain(message)}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## rechtzeitig\n\n💥 ${md(message)}\n`);
  process.exit(2);
}

/** Whether the event payload names the repository private or internal. Unknown counts as public. */
function repositoryIsPrivate(): boolean {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8"));
    const r = event?.repository;
    return r?.private === true || r?.visibility === "private" || r?.visibility === "internal";
  } catch {
    return false;
  }
}
