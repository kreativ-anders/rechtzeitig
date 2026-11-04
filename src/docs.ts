// Generates the rule cards in docs/checks.html and the "what runs when" tables in docs/checks.html and
// docs/workflow.html from rule.yml files and SWITCHES in src/rules.ts: npm run docs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEVERITIES, SWITCHES, type Switch } from "./rules.ts";
import { loadChecks, moduleOf, type LoadedCheck } from "./runner.ts";

const CHECKS_PAGE = new URL("../docs/checks.html", import.meta.url);
const WORKFLOW_PAGE = new URL("../docs/workflow.html", import.meta.url);
const SOURCE = "https://github.com/kreativ-anders/rechtzeitig/tree/main/checks";

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

/** Badge for an input that sends data to an outside service; empty when it sends nothing. Links to § 7 of the workflow page. */
export function sendsBadge(input: Switch, link = true): string {
  const s: { secret?: string; default?: boolean; service?: string } = SWITCHES[input];
  if (!s.service) return "";
  const label = `Sends data to ${esc(s.service)}${s.secret ? " (opt-in)" : ""}`;
  return link
    ? `<a class="sends" href="workflow.html#data">${label}</a>`
    : `<span class="sends" title="Data leaves the runner, see workflow.html#data">${label}</span>`;
}

/** When a rule with this input runs, in one sentence for the docs. */
export function runsWhen(input: Switch): string {
  const s: { secret?: string; default?: boolean; service?: string } = SWITCHES[input];
  if (s.secret) return `Opt-in: only when the secret <code>${s.secret}</code> is set (input <code>${input}</code>, token from ${esc(s.service ?? "")}). Without it the check is skipped and nothing is sent.`;
  if (s.default) return `On by default; sends data to ${esc(s.service ?? "")}. Turn it off with <code>${input}: false</code>.`;
  return `Opt-in: only with <code>${input}: true</code>.`;
}

/** Table of everything that turns checks on or off: the URL, the checkout, and every rule with `requires`. */
export function switchesHtml(checks: LoadedCheck[]): string {
  const rows = checks.flatMap((c) =>
    (c.rule.requires ?? []).map((input) => `<tr><td><a href="checks.html#${c.rule.id}">${text(c.rule.title.en)}</a><br><small>${c.rule.id}</small></td><td>${runsWhen(input)}${sendsBadge(input) && `<br>${sendsBadge(input)}`}</td></tr>`),
  );
  return [
    `<div class="table-wrap"><table>`,
    `<thead><tr><th>Check</th><th>Runs when</th></tr></thead>`,
    `<tbody>`,
    `<tr><td>All website checks</td><td>Only with a <code>url</code>.</td></tr>`,
    `<tr><td>All repository checks</td><td>Only when <code>actions/checkout</code> runs before rechtzeitig (folder: input <code>repository</code>).</td></tr>`,
    `<tr><td>A group of checks</td><td><code>modules</code> picks groups: legal, privacy, security, sustainability, accessibility, repo. Empty runs all.</td></tr>`,
    ...rows,
    `</tbody></table></div>`,
  ].join("\n");
}

function card(c: LoadedCheck, module: string): string {
  const r = c.rule;
  const level = SEVERITIES.indexOf(r.severity) + 1;
  const law = r.legal_basis?.en;
  const needs = (r.requires ?? []).map(runsWhen);
  const search = [r.id, c.id, r.title.en, r.title.de, law ?? "", r.how, ...(r.requires ?? [])].join(" ").toLowerCase();
  const sources = r.meta.sources.map((s) => `<a href="${esc(s)}">${esc(host(s))}</a>`).join(", ");
  return [
    `<details class="rule" id="${r.id}" data-module="${module}" data-severity="${r.severity}" data-search="${esc(search)}">`,
    `<summary>`,
    `<span class="rule-head"><span class="rule-id">${r.id}</span><span class="sev" data-level="${level}" title="Severity: ${r.severity}">${"<i></i>".repeat(5)}<b>${r.severity}</b></span></span>`,
    `<span class="rule-title">${text(r.title.en)}</span>`,
    ...(r.requires ?? []).map((input) => sendsBadge(input, false)).filter(Boolean),
    law ? `<span class="rule-law">${text(law)}</span>` : `<span class="rule-law none">Technical, no single law</span>`,
    `<span class="rule-more">How it is checked</span>`,
    `</summary>`,
    `<div class="rule-body"><dl>`,
    `<div><dt>How it is checked</dt><dd>${text(r.how)}</dd></div>`,
    needs.length ? `<div><dt>Runs when</dt><dd>${needs.join("<br>")}</dd></div>` : "",
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

/** Replaces what stands between <!-- name:start --> and <!-- name:end --> in `doc`. */
export function fill(doc: string, name: string, html: string): string {
  const [start, end] = [`<!-- ${name}:start -->`, `<!-- ${name}:end -->`];
  const [before, rest] = doc.split(start);
  if (rest === undefined || !rest.includes(end)) throw new Error(`marker ${start} … ${end} is missing`);
  return `${before}${start}\n${html}\n${end}${rest.split(end)[1]}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checks = await loadChecks();
  const page = readFileSync(CHECKS_PAGE, "utf8");
  writeFileSync(CHECKS_PAGE, fill(fill(page, "checks", checksHtml(checks)), "switches", switchesHtml(checks)));
  writeFileSync(WORKFLOW_PAGE, fill(readFileSync(WORKFLOW_PAGE, "utf8"), "switches", switchesHtml(checks)));
  console.log("docs/checks.html and docs/workflow.html updated");
}
