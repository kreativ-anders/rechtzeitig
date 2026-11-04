// Command line entry. Used by action.yml and for local runs:
//   node src/main.ts --url https://example.de --repo . --language de

import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { scan, VERSION } from "./scan.ts";
import { scanRepo } from "./repo/scan.ts";
import { toCycloneDx } from "./repo/sbom.ts";
import { loadChecks, OUTCOMES, runChecks, selectModules, type OutcomeStatus } from "./runner.ts";
import { LANGUAGES, SWITCHES, switchSpec, type Switch, type UiLanguage } from "./rules.ts";
import { errorMessage } from "./text.ts";
import { md, plain, repoName, toAnnotations, toFindings, toMarkdown, toText, withoutCommands, type Report } from "./report.ts";

const FAIL_ON: Record<string, OutcomeStatus[]> = {
  never: [],
  fail: ["fail", "error"],
  warn: ["fail", "error", "warn"],
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    repo: { type: "string" },
    language: { type: "string", default: "de" },
    "report-language": { type: "string", default: "" },
    modules: { type: "string", default: "" },
    subscriptions: { type: "string", default: "false" },
    sales: { type: "string", default: "false" },
    "fail-on": { type: "string", default: "never" },
    "max-pages": { type: "string", default: "10" },
    vulnerabilities: { type: "string", default: "true" },
    "require-sandbox": { type: "string", default: "true" },
    out: { type: "string", default: "rechtzeitig-report" },
  },
});

let url = (values.url || positionals[0] || "").trim();
if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
const failOn = values["fail-on"] || "never";
if (!FAIL_ON[failOn]) exit(`fail-on must be one of: ${Object.keys(FAIL_ON).join(", ")}`);
// The report follows the site language unless set; "all" and unknown languages fall back to English.
const wanted = values["report-language"] || values.language!.split(",")[0];
const language: UiLanguage = (LANGUAGES as readonly string[]).includes(wanted) ? (wanted as UiLanguage) : "en";
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
const checks = selectModules(await loadChecks(), modules);
const wantsRepo = checks.some((c) => c.check.repo);
// vulnerabilities=false sends nothing to api.osv.dev; the vulnerabilities rule then skips.
const osv = enabled.includes("vulnerabilities");
// A scan that breaks (no browser, no sandbox, unreadable repository) ends with a message, not a stack trace.
const failed = (e: unknown) => exit(errorMessage(e));
const repo = values.repo?.trim() && wantsRepo ? await scanRepo(values.repo, { osv }).catch(failed) : undefined;
const web = url && checks.some((c) => !c.check.repo)
  ? await scan(url, {
      language: values.language,
      subscriptions: enabled.includes("subscriptions"),
      sales: enabled.includes("sales"),
      maxPages: Number(values["max-pages"]) || 10,
      ipinfoToken: process.env.IPINFO_TOKEN || undefined,
      unsandboxed: values["require-sandbox"] === "false",
      onWarning: (w) => warnings.push(w),
    }).catch(failed)
  : undefined;
if (!web && !repo) exit("Nothing to scan. Pass a URL, or check out the repository before this step.");
if (web && web.start.js.status === 0 && web.start.noJs.status === 0) {
  exit(`Could not load ${url}: ${web.start.js.error ?? web.start.noJs.error ?? "unknown error"}`);
}

const outcomes = await runChecks(checks, { web, repo }, enabled);
const report: Report = { web, repo, outcomes, version: VERSION, startedAt, onGitHub: !!process.env.GITHUB_ACTIONS, language, warnings };
const findings = toFindings(outcomes, { version: VERSION, startedAt, target: { url: web?.url, repository: repo && repoName(repo.root) } }, language);
const markdown = toMarkdown(report);
writeFileSync(`${values.out}.md`, markdown);
writeFileSync(`${values.out}.json`, JSON.stringify(findings, null, 2));
if (repo) writeFileSync(join(dirname(values.out!), "rechtzeitig-sbom.cdx.json"), toCycloneDx(repo, VERSION));
const text = toText(report);
console.log(report.onGitHub ? withoutCommands(text) : text);
// Annotations for findings in files, outside the stop-commands block above; src/report.ts escapes every value.
if (report.onGitHub && repo) {
  const base = relative(process.env.GITHUB_WORKSPACE ?? process.cwd(), resolve(repo.root)).split(sep).join("/");
  for (const line of toAnnotations(report, base)) console.log(line);
}

const failing = outcomes.some((o) => FAIL_ON[failOn].includes(o.status));
// The most urgent outcome decides: fail (also for errors), warn, otherwise pass.
const worst = OUTCOMES.find((s) => outcomes.some((o) => o.status === s));
const result = worst === "fail" || worst === "error" ? "fail" : worst === "warn" ? "warn" : "pass";
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
process.exit(failing ? 1 : 0);

function exit(message: string): never {
  console.error(`rechtzeitig: ${plain(message)}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## rechtzeitig\n\n💥 ${md(message)}\n`);
  process.exit(2);
}
