import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { OUTCOMES, type Outcome, type OutcomeStatus } from "./runner.ts";
import { SEVERITIES } from "./rules.ts";
import { loadYaml } from "./data.ts";
import type { Params, RepoContext, RepoCoverage, ScanContext } from "./sdk.ts";
import { oneLine } from "./text.ts";
import { render, renderFinding } from "./messages.ts";

const ICONS: Record<OutcomeStatus, string> = {
  fail: "❌",
  warn: "⚠️",
  error: "💥",
  pass: "○",
  info: "ℹ️",
  suppressed: "⏸️",
  skip: "⏭️",
};
const SEVERITY_ORDER = [...SEVERITIES].reverse();

/** Folder name of the scanned repository. */
export const repoName = (root: string) => basename(root);

/** The outcome's message. */
export const say = (o: Outcome) => render(o.message, o.id);
/** The outcome's details, one line each. */
export const where = (o: Outcome) => o.details.map((d) => renderFinding(d, o.id));

const HOMEPAGE = "https://github.com/kreativ-anders/rechtzeitig";
const MAKER = "https://kreativ-anders.de";

// Report wording comes from lang/en.yml `messages.report`; rule titles, legal bases and fix hints from each rule.yml.
const t = (key: string, params?: Params) => render({ key, params }, "report");

export interface Report {
  web?: ScanContext;
  repo?: RepoContext;
  outcomes: Outcome[];
  version: string;
  startedAt: string;
  onGitHub: boolean;
  /** Problems that did not stop the scan, such as a missing browser sandbox. */
  warnings?: string[];
}

function counts(outcomes: Outcome[]): Record<OutcomeStatus, number> {
  const c = Object.fromEntries(OUTCOMES.map((s) => [s, 0])) as Record<OutcomeStatus, number>;
  for (const o of outcomes) c[o.status]++;
  return c;
}

/** Untrusted text for Markdown and HTML: one line, every metacharacter as an entity. */
export const md = (s: string) => oneLine(s).replace(/[<>&[\]()*_`!|\\#~]/g, (c) => `&#${c.charCodeAt(0)};`);
/** Untrusted text for the log: one line that can never start a workflow command. */
export const plain = (s: string) => oneLine(s).replace(/^::/, ": :");
// Trusted text from rule.yml in a table cell: backslashes first, so "\\|" cannot end the cell.
const cell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
const title = (r: Report) => [r.web?.url, r.repo && `repository ${repoName(r.repo.root)}`].filter(Boolean).join(" + ");
/** The status as readers see it: "no finding", never a word that sounds like approval. The JSON keeps the key. */
const label = (s: OutcomeStatus) => t(`status_${s}`);
const summaryLine = (r: Report, icons: boolean) => {
  const c = counts(r.outcomes);
  return OUTCOMES.filter((s) => c[s]).map((s) => `${icons ? `${ICONS[s]} ` : ""}${c[s]} ${label(s)}`).join(icons ? " · " : ", ");
};
/** Most urgent first: status, then severity. */
const sorted = (outcomes: Outcome[]) =>
  [...outcomes].sort(
    (a, b) => OUTCOMES.indexOf(a.status) - OUTCOMES.indexOf(b.status) || SEVERITY_ORDER.indexOf(a.rule.severity) - SEVERITY_ORDER.indexOf(b.rule.severity),
  );

/**
 * Lines for a suppressed outcome: category, expiry and reason; where the entry is and the status without it; for a
 * false positive, where to report it. The reason is untrusted text from the repository and goes through `esc`.
 */
function suppressionLines(o: Outcome, esc: (s: string) => string): string[] {
  const s = o.suppression;
  if (!s) return [];
  const until = s.expires ? t("suppressed_until", { date: s.expires }) : "";
  return [
    t("suppressed_by", { category: t(`category_${s.category}`), until, reason: esc(s.reason) }),
    t("suppressed_at", { status: label(s.status), place: esc(`${s.file}:${s.line}`) }),
    ...(s.category === "false-positive" ? [t("suppressed_report", { url: `${HOMEPAGE}/issues` })] : []),
  ];
}

/** Skipped before it started: no target or left out by `modules`. Listed once per reason, not per check. */
const notStarted = (o: Outcome) => o.because?.kind === "target" || o.because?.kind === "module";

const MAX_LISTED = loadYaml<{ common: { max_listed: number } }>("data/thresholds.yml").common.max_listed;
const MAX_FILE_MB = loadYaml<{ repo: { max_file_bytes: number } }>("data/thresholds.yml").repo.max_file_bytes / 1_000_000;

interface NotRunGroup {
  /** One line with the count and how to turn the checks on. */
  line: string;
  outcomes: Outcome[];
  /** Under the line: each check by title (switches), with its own message (nothing to read), or not at all. */
  listed: "title" | "message" | "none";
}

/** Skipped checks grouped by reason: no url, no checkout, modules, each switch, nothing to read. */
function notRun(r: Report): NotRunGroup[] {
  const groups = new Map<string, Outcome[]>();
  for (const o of r.outcomes) {
    const b = o.because;
    if (o.status !== "skip" || !b) continue;
    // Checks of both scopes get their own line: "both_url", "both_repository", "both_both".
    const key = b.kind === "target" ? `${b.both ? "both_" : ""}${b.missing}` : b.kind === "switch" ? `switch_${b.input}` : b.kind;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const order = (key: string) => ["url", "repository", "both_url", "both_repository", "both_both", "module"].indexOf(key) + 1 || (key === "data" ? 9 : 7);
  return [...groups.entries()].sort(([a], [b]) => order(a) - order(b)).map(([key, outcomes]) => {
    const count = outcomes.length;
    const b = outcomes[0].because!;
    if (b.kind === "switch") return { line: t("not_run_switch", { count, hint: say(outcomes[0]) }), outcomes, listed: "title" };
    if (b.kind === "module") return { line: t("not_run_module", { count, modules: b.modules.join(", ") }), outcomes, listed: "none" };
    return { line: t(`not_run_${key}`, { count }), outcomes, listed: key === "data" ? "message" : "none" };
  });
}

/** The "Not run" block: collapsed in Markdown, one line per reason. `names` lists the checks (not in counts mode). */
function notRunLines(r: Report, format: "md" | "text", names: boolean): string[] {
  const groups = notRun(r);
  if (!groups.length) return [];
  const total = groups.reduce((n, g) => n + g.outcomes.length, 0);
  const item = (o: Outcome, withMessage: boolean) => {
    const name = format === "md" ? `${cell(o.rule.title)} (${o.rule.id})` : o.id;
    return withMessage ? `${name}: ${(format === "md" ? md : plain)(say(o))}` : name;
  };
  const lines = groups.flatMap((g) => [
    format === "md" ? `- ${g.line}` : `  ${g.line}`,
    ...(names && g.listed !== "none" ? g.outcomes.map((o) => `${format === "md" ? "  - " : "    - "}${item(o, g.listed === "message")}`) : []),
  ]);
  if (format === "text") return [`${t("not_run", { count: total })}:`, ...lines];
  return [`<details><summary>${ICONS.skip} ${t("not_run", { count: total })}</summary>`, "", ...lines, "", "</details>", ""];
}

/** The collapsed block on what no scan can check: content, duties outside site and code, settings the site does not show. */
const limitLines = () => {
  return [`<details><summary>${ICONS.info} ${t("limits")}</summary>`, "", ...["content", "duties", "config", "interaction"].map((k) => `- ${t(`limits_${k}`)}`), "", "</details>", ""];
};

/** What the repository scan could not see or read, one line each; `warn` marks gaps the workflow can close. */
export function coverageLines(c: RepoCoverage, esc: (s: string) => string): Array<{ warn: boolean; text: string }> {
  const names = (items: string[]) =>
    items.slice(0, MAX_LISTED).join(", ") + (items.length > MAX_LISTED ? t("and_more", { count: items.length - MAX_LISTED }) : "");
  const line = (warn: boolean, key: string, items: string[], params: Params = {}) =>
    items.length ? [{ warn, text: t(key, { count: items.length, names: names(items), ...params }) }] : [];
  const missing = c.submodules.filter((s) => !s.checkedOut).map((s) => esc(s.path));
  const scanned = c.submodules.filter((s) => s.checkedOut).map((s) => esc(s.path));
  return [
    ...(c.listing === "walk" ? [{ warn: true, text: t("cov_walk", { why: esc(c.walked ?? "") }) }] : []),
    ...line(true, "cov_submodules_missing", missing),
    ...line(false, "cov_submodules", scanned),
    ...line(true, "cov_lfs", c.lfs.map(esc)),
    ...line(true, "cov_lockfiles_failed", c.lockfiles.failed.map((f) => `${esc(f.file)} (${t(`reason_${f.reason}`)})`)),
    ...line(false, "cov_lockfiles_empty", c.lockfiles.empty.map(esc)),
    ...line(true, "cov_unsupported", c.unsupported.map((u) => `${esc(u.file)} (${esc(u.ecosystem)})`)),
    ...line(false, "cov_large", c.large.map(esc), { limit: MAX_FILE_MB }),
    ...(c.binary.length ? [{ warn: false, text: t("cov_binary", { count: c.binary.length }) }] : []),
    ...line(false, "cov_private", c.private.map((p) => `${t(`source_${p.kind}`)} ${esc(p.source)} (${esc(p.file)})`)),
  ];
}

/**
 * The step summary for private repositories: the counts, then one line per finding (fail, error, warn, info,
 * suppressed), most urgent first. Places, fix hints and fingerprints are in the report JSON. Ends with a collapsed
 * "Not run" block that groups skipped checks by reason, and lists what the repository scan could not read.
 */
export function toSummary(r: Report): string {
  const list = sorted(r.outcomes).filter((o) => o.status !== "pass" && o.status !== "skip");
  const lines = [`## rechtzeitig: ${md(title(r))}`, "", summaryLine(r, true), ""];
  for (const o of list) {
    const places = o.details.length ? ` (${t("places", { count: o.details.length })})` : "";
    const off = o.suppression ? ` ${ICONS.suppressed} ${suppressionLines(o, md)[0]}` : "";
    lines.push(`- ${ICONS[o.status]} \`${o.rule.id}\` ${o.rule.title} · ${t(`severity_${o.rule.severity}`)}: ${md(say(o))}${places}${off}`);
  }
  lines.push(...(list.length ? [""] : []), `_${t(list.length ? "findings" : "no_findings")}_`, "");
  lines.push(...notRunLines(r, "md", true), ...limitLines(), `### ${t("scan")}`, "");
  if (r.web) {
    const w = r.web;
    lines.push(
      `- ${t("pages")}: ${w.pages.map((p) => md(w.short(p.url))).join(", ")}`,
      `- ${t("language")}: ${w.languages.join(", ")}${w.languagesFrom === "input" ? "" : ` (${t(`languages_${w.languagesFrom}`)})`} · ${t("subscriptions")}: ${t(w.subscriptions ? "yes" : "no")} · ${t("sales")}: ${t(w.sales ? "yes" : "no")}`,
      `- ${t("visitor")}${r.onGitHub ? `, ${t("runner")}` : ""}`,
    );
  }
  if (r.repo) {
    lines.push(`- ${t("repository", { files: r.repo.files.length, components: r.repo.components.length, lockfiles: r.repo.lockfiles.length, osv: md(r.repo.osv) })}`);
    for (const c of coverageLines(r.repo.coverage, md)) lines.push(`  - ${c.warn ? "⚠️ " : ""}${c.text}`);
  }
  for (const w of r.warnings ?? []) lines.push(`- ⚠️ ${md(w)}`);
  lines.push(`- [rechtzeitig](${HOMEPAGE}) ${r.version} · ${t("made_by", { maker: `[kreativ-anders](${MAKER})` })} · ${r.startedAt}`, "", `_${t("disclaimer")}_`, "");
  return lines.join("\n");
}

export function toText(r: Report): string {
  const lines = [`rechtzeitig: ${plain(title(r))}`, ""];
  const width = Math.max(...OUTCOMES.map((s) => label(s).length));
  for (const o of r.outcomes.filter((o) => !notStarted(o))) {
    lines.push(`${label(o.status).toUpperCase().padEnd(width)} ${o.id.padEnd(40)} ${plain(say(o))}`);
    for (const l of suppressionLines(o, plain)) lines.push(`      ${l}`);
    for (const d of where(o)) lines.push(`      - ${plain(d)}`);
  }
  const notStartedOnly = { ...r, outcomes: r.outcomes.filter(notStarted) };
  const coverage = r.repo ? coverageLines(r.repo.coverage, plain).map((c) => `${c.warn ? "Warning" : "Coverage"}: ${c.text}`) : [];
  lines.push("", ...notRunLines(notStartedOnly, "text", false), ...coverage, ...(r.warnings ?? []).map((w) => `Warning: ${plain(w)}`), summaryLine(r, false));
  return lines.join("\n");
}

/** The counts-only report for the step summary (`md`) or the log. Names no check and no place. */
export function toCounts(r: Report, format: "md" | "text"): string {
  const note = t("hidden_public");
  // The reasons name inputs, never a check or a place, so they may show here.
  if (format === "text") {
    return [`rechtzeitig: ${plain(title(r))}`, "", ...notRunLines(r, "text", false), ...(r.warnings ?? []).map((w) => `Warning: ${plain(w)}`), summaryLine(r, false), note].join("\n");
  }
  const warnings = (r.warnings ?? []).map((w) => `- ⚠️ ${md(w)}`);
  return [`## rechtzeitig: ${md(title(r))}`, "", summaryLine(r, true), "", `_${note}_`, "", ...notRunLines(r, "md", false), ...warnings, ...(warnings.length ? [""] : []),
    `- [rechtzeitig](${HOMEPAGE}) ${r.version} · ${r.startedAt}`, ""].join("\n");
}

const LEVEL: Partial<Record<OutcomeStatus, string>> = { fail: "error", error: "error", warn: "warning", info: "notice" };
// Escaping of the GitHub Actions toolkit: data may not hold line breaks or %, properties also no , and :.
const escData = (s: string) => oneLine(s).replace(/%/g, "%25");
const escProp = (s: string) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/**
 * One workflow command per finding with a file, so GitHub shows it at that line in pull requests.
 * Printed outside the stop-commands block; every value is escaped, so a file name cannot add a command.
 * `base` is the scanned repository's folder relative to the workspace ("" when it is the workspace).
 */
export function toAnnotations(r: Report, base = ""): string[] {
  return sorted(r.outcomes).flatMap((o) => {
    const level = LEVEL[o.status];
    if (!level) return [];
    const title = escProp(`${o.rule.title} (${o.rule.id})`);
    return o.details.flatMap((d) => {
      if (typeof d === "string" || !d.file) return [];
      const line = d.line ? `,line=${d.line}` : "";
      const text = d.key ? render({ key: d.key, params: d.params }, o.id) : (d.text ?? say(o));
      return [`::${level} file=${escProp(base ? `${base}/${d.file}` : d.file)}${line},title=${title}::${escData(text)}`];
    });
  });
}

/**
 * Wraps log output so GitHub runs no workflow command from it, even if a line slipped through.
 * The token is random, so scanned content cannot end the block.
 */
export function withoutCommands(text: string, token = randomUUID()): string {
  return `::stop-commands::${token}\n${text}\n::${token}::`;
}
