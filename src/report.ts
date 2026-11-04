import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { OUTCOMES, type Outcome, type OutcomeStatus } from "./runner.ts";
import { SEVERITIES, type UiLanguage } from "./rules.ts";
import type { Params, RepoContext, ScanContext } from "./sdk.ts";
import { oneLine } from "./text.ts";
import { render, renderFinding } from "./messages.ts";

const ICONS: Record<OutcomeStatus, string> = {
  fail: "❌",
  warn: "⚠️",
  error: "💥",
  pass: "✅",
  info: "ℹ️",
  skip: "⏭️",
};
const SEVERITY_ORDER = [...SEVERITIES].reverse();

/** Folder name of the scanned repository. */
export const repoName = (root: string) => basename(root);

/** Shape of rechtzeitig-report.json: rule ids, results and where they were found. No page text, no file contents. */
export interface Findings {
  version: string;
  startedAt: string;
  target: { url?: string; repository?: string };
  results: Array<{
    rule: string;
    check: string;
    severity: string;
    status: OutcomeStatus;
    /** In the report language. */
    message: string;
    /** Message key and parameters (lang/<code>.yml `messages`), the same in every language. */
    key?: string;
    params?: Params;
    /** Pages, files with line numbers, hosts. Secrets are already redacted by the checks. */
    locations: string[];
  }>;
}

/** The outcome's message in `lang`. */
export const say = (o: Outcome, lang: UiLanguage) => render(o.message, o.id, lang);
/** The outcome's details in `lang`, one line each. */
export const where = (o: Outcome, lang: UiLanguage) => o.details.map((d) => renderFinding(d, o.id, lang));

/** Parameters can hold text from the scanned site; one line each, like every other output. */
const cleanParams = (params?: Params): Params | undefined =>
  params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, cleanValue(v)]));
const cleanValue = (v: Params[string]): Params[string] => {
  if (typeof v === "string") return oneLine(v);
  if (typeof v === "number") return v;
  if ("key" in v) return { key: v.key, params: cleanParams(v.params as Params | undefined) };
  return Object.fromEntries(Object.entries(v).map(([lang, text]) => [lang, oneLine(text)])) as typeof v;
};

export function toFindings(outcomes: Outcome[], meta: Omit<Findings, "results">, lang: UiLanguage = "en"): Findings {
  return {
    ...meta,
    results: outcomes.map((o) => ({
      rule: o.rule.id,
      check: o.id,
      severity: o.rule.severity,
      status: o.status,
      message: oneLine(say(o, lang)),
      ...(typeof o.message === "string" ? {} : { key: o.message.key, params: cleanParams(o.message.params) }),
      locations: where(o, lang).map((d) => oneLine(d)),
    })),
  };
}

const HOMEPAGE = "https://github.com/kreativ-anders/rechtzeitig";
const MAKER = "https://kreativ-anders.de";

// Report wording comes from lang/<code>.yml `messages.report`; rule titles, legal bases and fix hints from each rule.yml.
const ui = (lang: UiLanguage) => (key: string, params?: Params) => render({ key, params }, "report", lang);

export interface Report {
  web?: ScanContext;
  repo?: RepoContext;
  outcomes: Outcome[];
  version: string;
  startedAt: string;
  onGitHub: boolean;
  language: UiLanguage;
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
const summaryLine = (r: Report, icons: boolean) => {
  const c = counts(r.outcomes);
  return OUTCOMES.filter((s) => c[s]).map((s) => `${icons ? `${ICONS[s]} ` : ""}${c[s]} ${s}`).join(icons ? " · " : ", ");
};
/** Most urgent first: status, then severity. */
const sorted = (outcomes: Outcome[]) =>
  [...outcomes].sort(
    (a, b) => OUTCOMES.indexOf(a.status) - OUTCOMES.indexOf(b.status) || SEVERITY_ORDER.indexOf(a.rule.severity) - SEVERITY_ORDER.indexOf(b.rule.severity),
  );
const open = (o: Outcome) => o.status === "fail" || o.status === "warn" || o.status === "info";

/**
 * The report as Markdown. With `findingsOnly` (the step summary) passed and skipped checks are left out
 * and a line points to the artifact, which keeps the full report.
 */
export function toMarkdown(r: Report, { findingsOnly = false } = {}): string {
  const t = ui(r.language);
  const lang = r.language;
  const list = sorted(r.outcomes).filter((o) => !findingsOnly || (o.status !== "pass" && o.status !== "skip"));
  const lines = [`## rechtzeitig: ${md(title(r))}`, "", summaryLine(r, true), ""];
  if (findingsOnly) lines.push(`_${t(list.length ? "findings_only" : "no_findings")}_`, "");
  if (list.length) {
    lines.push(
      `| | ${t("check")} | ${t("severity")} | ${t("result")} |`,
      "|---|---|---|---|",
      ...list.map((o) => {
        const law = o.rule.legal_basis?.[lang];
        return `| ${ICONS[o.status]} | ${cell(o.rule.title[lang])}<br><sub>${o.rule.id}${law ? ` · ${cell(law)}` : ""}</sub> | ${t(`severity_${o.rule.severity}`)} | ${md(say(o, lang))} |`;
      }),
      "",
    );
  }
  const withDetails = list.filter((o) => o.details.length || open(o));
  if (withDetails.length) {
    lines.push(`### ${t("details")}`, "");
    for (const o of withDetails) {
      const fix = open(o) ? [`**${t("fix")}:** ${o.rule.fix_hint[lang]}`, ""] : [];
      lines.push(`<details><summary>${ICONS[o.status]} ${o.rule.title[lang]} (${o.rule.id})</summary>`, "", ...fix, ...where(o, lang).map((d) => `- ${md(d)}`), "", "</details>", "");
    }
  }
  lines.push(`### ${t("scan")}`, "");
  if (r.web) {
    const w = r.web;
    lines.push(
      `- ${t("pages")}: ${w.pages.map((p) => md(w.short(p.url))).join(", ")}`,
      `- ${t("language")}: ${w.languages.join(", ")} · ${t("subscriptions")}: ${t(w.subscriptions ? "yes" : "no")} · ${t("sales")}: ${t(w.sales ? "yes" : "no")}`,
      `- ${t("visitor")}${r.onGitHub ? `, ${t("runner")}` : ""}`,
    );
  }
  if (r.repo) lines.push(`- ${t("repository", { files: r.repo.files.length, components: r.repo.components.length, lockfiles: r.repo.lockfiles.length, osv: md(r.repo.osv) })}`);
  for (const w of r.warnings ?? []) lines.push(`- ⚠️ ${md(w)}`);
  lines.push(`- [rechtzeitig](${HOMEPAGE}) ${r.version} · ${t("made_by", { maker: `[kreativ-anders](${MAKER})` })} · ${r.startedAt}`, "", `_${t("disclaimer")}_`, "");
  return lines.join("\n");
}

export function toText(r: Report): string {
  const lines = [`rechtzeitig: ${plain(title(r))}`, ""];
  for (const o of r.outcomes) {
    lines.push(`${o.status.toUpperCase().padEnd(5)} ${o.id.padEnd(40)} ${plain(say(o, r.language))}`);
    for (const d of where(o, r.language)) lines.push(`      - ${plain(d)}`);
  }
  lines.push("", ...(r.warnings ?? []).map((w) => `Warning: ${plain(w)}`), summaryLine(r, false));
  return lines.join("\n");
}

/**
 * How much of the report the run shows (input `report-visibility`). `full` shows everything; `counts` only
 * how many checks ended in each status, without rule ids, messages or places; `none` nothing.
 */
export const VISIBILITIES = ["auto", "full", "counts", "none"] as const;
export type Visibility = Exclude<(typeof VISIBILITIES)[number], "auto">;
/** Why details are hidden: the repository is public (or did not say), or the input asked for it. */
export type HiddenBecause = "public" | "input";

/** The counts-only report for the step summary (`md`) or the log. Names no check and no place. */
export function toCounts(r: Report, because: HiddenBecause, format: "md" | "text"): string {
  const t = ui(r.language);
  const note = t(because === "public" ? "hidden_public" : "hidden");
  if (format === "text") {
    return [`rechtzeitig: ${plain(title(r))}`, "", ...(r.warnings ?? []).map((w) => `Warning: ${plain(w)}`), summaryLine(r, false), note].join("\n");
  }
  const warnings = (r.warnings ?? []).map((w) => `- ⚠️ ${md(w)}`);
  return [`## rechtzeitig: ${md(title(r))}`, "", summaryLine(r, true), "", `_${note}_`, "", ...warnings, ...(warnings.length ? [""] : []),
    `- [rechtzeitig](${HOMEPAGE}) ${r.version} · ${r.startedAt}`, ""].join("\n");
}

/** The single log line for `report-visibility: none`. */
export const noneNote = (lang: UiLanguage) => ui(lang)("hidden_none");

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
    const title = escProp(`${o.rule.title[r.language]} (${o.rule.id})`);
    return o.details.flatMap((d) => {
      if (typeof d === "string" || !d.file) return [];
      const line = d.line ? `,line=${d.line}` : "";
      const text = d.key ? render({ key: d.key, params: d.params }, o.id, r.language) : (d.text ?? say(o, r.language));
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
