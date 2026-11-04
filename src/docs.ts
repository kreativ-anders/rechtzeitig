// Generates the rule cards in docs/checks.html from rule.yml files: npm run docs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEVERITIES } from "./rules.ts";
import { loadChecks, moduleOf, type LoadedCheck } from "./runner.ts";

const FILE = new URL("../docs/checks.html", import.meta.url);
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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escapes text and turns `backticks` into <code>. */
const text = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function card(c: LoadedCheck, module: string): string {
  const r = c.rule;
  const level = SEVERITIES.indexOf(r.severity) + 1;
  const law = r.legal_basis?.en;
  const search = [r.id, c.id, r.title.en, r.title.de, law ?? "", r.how].join(" ").toLowerCase();
  const sources = r.meta.sources.map((s) => `<a href="${esc(s)}">${esc(host(s))}</a>`).join(", ");
  return [
    `<details class="rule" id="${r.id}" data-module="${module}" data-severity="${r.severity}" data-search="${esc(search)}">`,
    `<summary>`,
    `<span class="rule-head"><span class="rule-id">${r.id}</span><span class="sev" data-level="${level}" title="Severity: ${r.severity}">${"<i></i>".repeat(5)}<b>${r.severity}</b></span></span>`,
    `<span class="rule-title">${text(r.title.en)}</span>`,
    law ? `<span class="rule-law">${text(law)}</span>` : `<span class="rule-law none">Technical, no single law</span>`,
    `<span class="rule-more">How it is checked</span>`,
    `</summary>`,
    `<div class="rule-body"><dl>`,
    `<div><dt>How it is checked</dt><dd>${text(r.how)}</dd></div>`,
    `<div><dt>How to fix</dt><dd>${text(r.fix_hint.en)}</dd></div>`,
    `<div><dt>Code</dt><dd><a href="${SOURCE}/${c.id}"><code>checks/${c.id}</code></a></dd></div>`,
    sources ? `<div><dt>Sources</dt><dd>${sources}</dd></div>` : "",
    `<div><dt>Reviewed</dt><dd><time datetime="${esc(r.meta.last_reviewed)}">${esc(r.meta.last_reviewed)}</time></dd></div>`,
    `</dl></div>`,
    `</details>`,
  ].filter(Boolean).join("\n");
}

export function checksHtml(checks: LoadedCheck[]): string {
  const out: string[] = [];
  for (const [module, heading] of Object.entries(MODULES)) {
    const list = checks.filter((c) => moduleOf(c.id) === module);
    if (!list.length) continue;
    out.push(
      `<section class="module" data-module="${module}">`,
      `<h3>${heading} <small>${list.length} ${list.length === 1 ? "rule" : "rules"}</small></h3>`,
      `<div class="rules">`,
      ...list.map((c) => card(c, module)),
      `</div>`,
      `</section>`,
    );
  }
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = readFileSync(FILE, "utf8");
  const [before, rest] = doc.split(START);
  const after = rest.split(END)[1];
  writeFileSync(FILE, `${before}${START}\n${checksHtml(await loadChecks())}\n${END}${after}`);
  console.log("docs/checks.html updated");
}
