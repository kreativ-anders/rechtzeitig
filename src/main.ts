// Command line entry. Used by action.yml and for local runs:
//   node src/main.ts --url https://example.de --repo . --language de

import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { scan, VERSION } from "./scan.ts";
import { scanRepo } from "./repo/scan.ts";
import { toCycloneDx } from "./repo/sbom.ts";
import { loadChecks, runChecks, selectModules, type Outcome } from "./runner.ts";
import { LANGUAGES, type UiLanguage } from "./rules.ts";
import { md, plain, toMarkdown, toText, withoutCommands, type Report } from "./report.ts";
import { artifactSink, toFindings } from "./sink.ts";

const FAIL_ON: Record<string, Outcome["status"][]> = {
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
const warnings: string[] = [];
const checks = selectModules(await loadChecks(), modules);
const wantsRepo = checks.some((c) => c.check.repo);
const repo = values.repo?.trim() && wantsRepo ? await scanRepo(values.repo) : undefined;
const web = url && checks.some((c) => !c.check.repo)
  ? await scan(url, {
      language: values.language,
      subscriptions: values.subscriptions === "true",
      sales: values.sales === "true",
      maxPages: Number(values["max-pages"]) || 10,
      ipinfoToken: process.env.IPINFO_TOKEN || undefined,
      onWarning: (w) => warnings.push(w),
    })
  : undefined;
if (!web && !repo) exit("Nothing to scan. Pass a URL, or check out the repository before this step.");
if (web && web.start.js.status === 0 && web.start.noJs.status === 0) {
  exit(`Could not load ${url}: ${web.start.js.error ?? web.start.noJs.error ?? "unknown error"}`);
}

const outcomes = await runChecks(checks, { web, repo });
const report: Report = { web, repo, outcomes, version: VERSION, startedAt, onGitHub: !!process.env.GITHUB_ACTIONS, language, warnings };
const findings = toFindings(outcomes, { version: VERSION, startedAt, target: { url: web?.url, repository: repo?.root.split("/").pop() } });
const markdown = toMarkdown(report);
writeFileSync(`${values.out}.md`, markdown);
writeFileSync(`${values.out}.json`, JSON.stringify(findings, null, 2));
if (repo) writeFileSync(join(dirname(values.out!), "rechtzeitig-sbom.cdx.json"), toCycloneDx(repo, VERSION));
await artifactSink.send(findings);
const text = toText(report);
console.log(report.onGitHub ? withoutCommands(text) : text);

const failed = outcomes.some((o) => FAIL_ON[failOn].includes(o.status));
const result = outcomes.some((o) => o.status === "fail" || o.status === "error") ? "fail"
  : outcomes.some((o) => o.status === "warn") ? "warn"
  : "pass";
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
process.exit(failed ? 1 : 0);

function exit(message: string): never {
  console.error(`rechtzeitig: ${plain(message)}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## rechtzeitig\n\n💥 ${md(message)}\n`);
  process.exit(2);
}
