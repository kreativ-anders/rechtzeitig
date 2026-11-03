// Generates the check tables in docs/checks.md from rule.yml files: npm run docs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadChecks, type LoadedCheck } from "./runner.ts";

const FILE = new URL("../docs/checks.md", import.meta.url);
const START = "<!-- checks:start -->";
const END = "<!-- checks:end -->";
const MODULES: Record<string, string> = {
  legal: "Legal",
  privacy: "Privacy and consent",
  security: "Security",
  sustainability: "Sustainability",
  accessibility: "Accessibility",
  repo: "Repository",
};

export function checksTable(checks: LoadedCheck[]): string {
  const out: string[] = [];
  for (const [module, heading] of Object.entries(MODULES)) {
    const list = checks.filter((c) => c.id.split("/")[0] === module);
    if (!list.length) continue;
    out.push(`### ${heading}`, "", "| Check | Rule | Severity | What it checks | Law |", "|---|---|---|---|---|");
    for (const c of list) {
      out.push(`| \`${c.id}\` | ${c.rule.id} | ${c.rule.severity} | ${c.rule.title.en} | ${c.rule.legal_basis?.en ?? ""} |`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = readFileSync(FILE, "utf8");
  const [before, rest] = doc.split(START);
  const after = rest.split(END)[1];
  writeFileSync(FILE, `${before}${START}\n${checksTable(await loadChecks())}\n${END}${after}`);
  console.log("docs/checks.md updated");
}
