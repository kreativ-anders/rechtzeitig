// Command line entry. Used by action.yml and for local runs:
//   node src/main.ts https://example.de --language de --subscriptions true --fail-on fail

import { appendFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { scan, VERSION } from "./scan.ts";
import { loadChecks, runChecks, type Outcome } from "./runner.ts";
import { toJson, toMarkdown, toText } from "./report.ts";

const FAIL_ON: Record<string, Outcome["status"][]> = {
  fail: ["fail", "error"],
  warn: ["fail", "error", "warn"],
  never: [],
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    language: { type: "string", default: "de" },
    subscriptions: { type: "string", default: "false" },
    "fail-on": { type: "string", default: "fail" },
    "max-pages": { type: "string", default: "10" },
    out: { type: "string", default: "vibecoda-report" },
  },
});

let url = (values.url || positionals[0] || "").trim();
const failOn = values["fail-on"] ?? "fail";
if (!url) exit("Missing URL. Usage: node src/main.ts https://example.de");
if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
if (!FAIL_ON[failOn]) exit(`fail-on must be one of: ${Object.keys(FAIL_ON).join(", ")}`);

const startedAt = new Date().toISOString();
const ctx = await scan(url, {
  language: values.language,
  subscriptions: values.subscriptions === "true",
  maxPages: Number(values["max-pages"]) || 10,
});
if (ctx.start.js.status === 0 && ctx.start.noJs.status === 0) {
  exit(`Could not load ${url}: ${ctx.start.js.error ?? ctx.start.noJs.error ?? "unknown error"}`);
}

const outcomes = await runChecks(await loadChecks(), ctx);
const meta = { version: VERSION, startedAt, onGitHub: !!process.env.GITHUB_ACTIONS };
const markdown = toMarkdown(ctx, outcomes, meta);
writeFileSync(`${values.out}.md`, markdown);
writeFileSync(`${values.out}.json`, toJson(ctx, outcomes, meta));
console.log(toText(ctx, outcomes));

const failed = outcomes.some((o) => FAIL_ON[failOn].includes(o.status));
const result = outcomes.some((o) => o.status === "fail" || o.status === "error") ? "fail"
  : outcomes.some((o) => o.status === "warn") ? "warn"
  : "pass";
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
process.exit(failed ? 1 : 0);

function exit(message: string): never {
  console.error(`vibecoda: ${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## vibecoda\n\n💥 ${message}\n`);
  process.exit(2);
}
