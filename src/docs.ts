// Generates the rule cards in docs/checks.html, the "what runs when" tables in docs/checks.html and
// docs/workflow.html, the rule count and review dates in docs/index.html and docs/de/index.html, and
// the rule lists of the topic pages docs/security.html and docs/de/kuendigungsbutton.html from rule.yml
// files and SWITCHES in src/rules.ts: npm run docs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEVERITIES, switchSpec, type Switch } from "./rules.ts";
import { loadChecks, moduleOf, type LoadedCheck } from "./runner.ts";

const CHECKS_PAGE = new URL("../docs/checks.html", import.meta.url);
const WORKFLOW_PAGE = new URL("../docs/workflow.html", import.meta.url);
const INDEX_PAGE = new URL("../docs/index.html", import.meta.url);
const INDEX_PAGE_DE = new URL("../docs/de/index.html", import.meta.url);
const SECURITY_PAGE = new URL("../docs/security.html", import.meta.url);
const SHOP_PAGE_DE = new URL("../docs/de/kuendigungsbutton.html", import.meta.url);
/** Rules on docs/de/kuendigungsbutton.html: buttons, withdrawal, prices and terms for online sales. */
export const SHOP_RULES = ["LEG-DE-BTN-001", "LEG-DE-BTN-002", "LEG-DE-BTN-003", "LEG-DE-WDR-001", "LEG-DE-PRICE-001", "LEG-DE-AGB-001"];
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
  const s = switchSpec(input);
  if (!s.service) return "";
  const label = `Sends data to ${esc(s.service)}${s.secret ? " (opt-in)" : ""}`;
  return link
    ? `<a class="sends" href="workflow.html#data">${label}</a>`
    : `<span class="sends" title="Data leaves the runner, see workflow.html#data">${label}</span>`;
}

/** When a rule with this input runs, in one sentence for the docs. */
export function runsWhen(input: Switch): string {
  const s = switchSpec(input);
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
    `<tr><td>A group of checks</td><td><code>modules</code> picks groups: ${Object.keys(MODULES).join(", ")}. Empty runs all.</td></tr>`,
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
    `<span class="rule-head"><span class="rule-id">${r.id}</span><span class="sev" data-level="${level}" title="Severity: ${r.severity}">${"<i></i>".repeat(5)}<span class="sev-name">${r.severity}</span></span></span>`,
    `<span class="rule-title">${text(r.title.en)}</span>`,
    `<span class="rule-title-de" lang="de">${text(r.title.de)}</span>`,
    ...(r.requires ?? []).map((input) => sendsBadge(input, false)).filter(Boolean),
    law ? `<span class="rule-law">${text(law)}</span>` : `<span class="rule-law none">Technical, no single law</span>`,
    `<span class="rule-more">How it is checked</span>`,
    `</summary>`,
    `<div class="rule-body"><dl>`,
    `<div><dt>How it is checked</dt><dd>${text(r.how)}</dd></div>`,
    needs.length ? `<div><dt>Runs when</dt><dd>${needs.join("<br>")}</dd></div>` : "",
    `<div><dt>How to fix</dt><dd>${text(r.fix_hint.en)}</dd></div>`,
    `<div><dt>Code</dt><dd><a href="${SOURCE}/${c.id}"><code>checks/${c.id}</code></a></dd></div>`,
    `<div><dt>Sources</dt><dd>${sources}</dd></div>`,
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
      `<section class="module" id="${module}" data-module="${module}">`,
      `<h3>${heading} <small>${list.length} ${list.length === 1 ? "rule" : "rules"}</small></h3>`,
      `<div class="rules">`,
      ...list.map((c) => card(c, module)),
      `</div>`,
      `</section>`,
    );
  }
  return out.join("\n");
}

type Lang = "en" | "de";
const LOCALE: Record<Lang, string> = { en: "en-GB", de: "de-DE" };
const day = (iso: string, lang: Lang = "en") =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const time = (iso: string, lang: Lang = "en") => `<time datetime="${esc(iso)}">${day(iso, lang)}</time>`;

/** The hero link to checks.html on the start page, with the number of rules. The German page links up one folder. */
export function heroChecksHtml(checks: LoadedCheck[], lang: Lang = "en"): string {
  return lang === "de"
    ? `<a class="button secondary" href="../checks.html" hreflang="en">Alle ${checks.length} Prüfungen ansehen</a>`
    : `<a class="button secondary" href="checks.html">See all ${checks.length} checks</a>`;
}

/** The start page's line on how current the rules are: the oldest and newest meta.last_reviewed. */
export function reviewedHtml(checks: LoadedCheck[], lang: Lang = "en"): string {
  const dates = checks.map((c) => c.rule.meta.last_reviewed).sort();
  const [oldest, newest] = [dates[0], dates.at(-1)!];
  if (lang === "de") {
    const when = oldest === newest ? `am ${time(oldest, "de")}` : `zwischen dem ${time(oldest, "de")} und dem ${time(newest, "de")}`;
    return `<p class="reviewed">Alle ${checks.length} Prüfungen wurden zuletzt ${when} mit ihren Quellen abgeglichen. Eine Prüfung, die ein Jahr lang nicht abgeglichen wurde, lässt die Tests des Projekts scheitern.</p>`;
  }
  const when = oldest === newest ? `on ${time(oldest)}` : `between ${time(oldest)} and ${time(newest)}`;
  return `<p class="reviewed">All ${checks.length} checks were last reviewed against their sources ${when}. A check not reviewed for a year fails the project's tests.</p>`;
}

/** When a rule with this input runs, in German. Only opt-in flags have a German sentence; the rest link to the workflow page. */
function runsWhenDe(input: Switch): string {
  const s = switchSpec(input);
  if (!s.secret && !s.default) return `nur mit <code>${input}: true</code>.`;
  return `<span lang="en">${runsWhen(input)}</span>`;
}

/**
 * The rule list of a topic page: title (linked to its card on checks.html), legal basis, how it is
 * checked and, on the German page, the German fix hint. German pages live in docs/de/ and link up one folder.
 */
export function topicRulesHtml(checks: LoadedCheck[], lang: Lang = "en"): string {
  const de = lang === "de";
  const items = checks.map(({ rule: r }) => {
    const law = r.legal_basis?.[lang];
    const link = de ? `<a href="../checks.html#${r.id}" hreflang="en">` : `<a href="checks.html#${r.id}">`;
    const needs = (r.requires ?? []).map(de ? runsWhenDe : runsWhen);
    return [
      `<li class="topic-rule" id="${r.id}">`,
      `<h3>${link}${text(r.title[lang])}</a></h3>`,
      `<p class="rule-meta"><span class="rule-id">${r.id}</span> · <span class="rule-law${law ? "" : " none"}">${law ? text(law) : de ? "Technisch, kein einzelnes Gesetz" : "Technical, no single law"}</span></p>`,
      de
        ? `<p><span class="report-label">So wird geprüft</span> <span lang="en">${text(r.how)}</span></p>`
        : `<p><span class="report-label">How it is checked</span> ${text(r.how)}</p>`,
      needs.length ? `<p><span class="report-label">${de ? "Läuft" : "Runs when"}</span> ${needs.join(" ")}</p>` : "",
      `<p><span class="report-label">${de ? "Behebung" : "Fix"}</span> ${text(r.fix_hint[lang])}</p>`,
      `</li>`,
    ].filter(Boolean).join("\n");
  });
  return [`<ul class="topic-rules">`, ...items, `</ul>`].join("\n");
}

/** The rules on docs/security.html: every website check in checks/security/. */
export const securityChecks = (checks: LoadedCheck[]) => checks.filter((c) => moduleOf(c.id) === "security");
/** The rules on docs/de/kuendigungsbutton.html, in the order of SHOP_RULES. */
export const shopChecks = (checks: LoadedCheck[]) => SHOP_RULES.map((id) => {
  const c = checks.find((x) => x.rule.id === id);
  if (!c) throw new Error(`rule ${id} for docs/de/kuendigungsbutton.html is missing`);
  return c;
});

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
  const index = readFileSync(INDEX_PAGE, "utf8");
  writeFileSync(INDEX_PAGE, fill(fill(index, "hero-checks", heroChecksHtml(checks)), "reviewed", reviewedHtml(checks)));
  const indexDe = readFileSync(INDEX_PAGE_DE, "utf8");
  writeFileSync(INDEX_PAGE_DE, fill(fill(indexDe, "hero-checks", heroChecksHtml(checks, "de")), "reviewed", reviewedHtml(checks, "de")));
  writeFileSync(SECURITY_PAGE, fill(readFileSync(SECURITY_PAGE, "utf8"), "topic-rules", topicRulesHtml(securityChecks(checks))));
  writeFileSync(SHOP_PAGE_DE, fill(readFileSync(SHOP_PAGE_DE, "utf8"), "topic-rules", topicRulesHtml(shopChecks(checks), "de")));
  console.log("docs/checks.html, docs/workflow.html, docs/index.html, docs/de/index.html, docs/security.html and docs/de/kuendigungsbutton.html updated");
}
