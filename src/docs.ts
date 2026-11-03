// Generates the rule tables in docs/checks.md from rule.yml files: npm run docs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadChecks, type LoadedCheck } from "./runner.ts";

const FILE = new URL("../docs/checks.md", import.meta.url);
const SOURCE = "https://github.com/kreativ-anders/rechtzeitig/tree/main/checks";
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

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function checksTable(checks: LoadedCheck[]): string {
  const out: string[] = [];
  for (const [module, heading] of Object.entries(MODULES)) {
    const list = checks.filter((c) => c.id.split("/")[0] === module);
    if (!list.length) continue;
    out.push(`### ${heading}`, "", "| Rule | Severity | What | How it is checked | Law |", "|---|---|---|---|---|");
    for (const c of list) {
      const rule = `**${c.rule.id}**<br>[\`${c.id}\`](${SOURCE}/${c.id})`;
      out.push(`| ${rule} | ${c.rule.severity} | ${cell(c.rule.title.en)} | ${cell(c.rule.how)} | ${cell(c.rule.legal_basis?.en ?? "")} |`);
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
