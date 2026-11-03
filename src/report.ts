import { randomUUID } from "node:crypto";
import type { Outcome } from "./runner.ts";
import type { UiLanguage } from "./rules.ts";
import type { RepoContext, ScanContext } from "./sdk.ts";
import { oneLine } from "./text.ts";

export const ICONS: Record<Outcome["status"], string> = {
  fail: "❌",
  warn: "⚠️",
  error: "💥",
  pass: "✅",
  info: "ℹ️",
  skip: "⏭️",
};
const ORDER = Object.keys(ICONS);
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

// Report wording. Titles, legal bases and fix hints come from each rule.yml; messages from the checks are English.
const UI = {
  en: {
    check: "Check", severity: "Severity", result: "Result", details: "Details", scan: "Scan", fix: "Fix",
    pages: "Pages", language: "Language", subscriptions: "Subscriptions", sales: "Sales", yes: "yes", no: "no",
    visitor: "Visitor: fresh browser, no clicks, no consent given", runner: "GitHub-hosted runner (US data center)",
    repository: (files: number, components: number, lockfiles: number, osv: string) =>
      `Repository: ${files} files, ${components} components from ${lockfiles} lockfile(s), OSV: ${osv}`,
    disclaimer: "Technical risk hints with the place they were found and the legal basis they relate to. Not legal advice.",
  },
  de: {
    check: "Prüfung", severity: "Schwere", result: "Ergebnis", details: "Details", scan: "Scan", fix: "Behebung",
    pages: "Seiten", language: "Sprache", subscriptions: "Abos", sales: "Verkauf", yes: "ja", no: "nein",
    visitor: "Besucher: frischer Browser, keine Klicks, keine Einwilligung", runner: "GitHub-Runner (Rechenzentrum in den USA)",
    repository: (files: number, components: number, lockfiles: number, osv: string) =>
      `Repository: ${files} Dateien, ${components} Komponenten aus ${lockfiles} Lockfile(s), OSV: ${osv}`,
    disclaimer: "Technische Risikohinweise mit Fundstelle und Bezug zur Rechtsgrundlage. Keine Rechtsberatung.",
  },
} satisfies Record<UiLanguage, unknown>;

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

export function counts(outcomes: Outcome[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const s of ORDER) c[s] = outcomes.filter((o) => o.status === s).length;
  return c;
}

/** Untrusted text for Markdown and HTML: one line, every metacharacter as an entity. */
export const md = (s: string) => oneLine(s).replace(/[<>&[\]()*_`!|\\#~]/g, (c) => `&#${c.charCodeAt(0)};`);
/** Untrusted text for the log: one line that can never start a workflow command. */
export const plain = (s: string) => oneLine(s).replace(/^::/, ": :");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const title = (r: Report) => [r.web?.url, r.repo && `repository ${r.repo.root.split("/").pop()}`].filter(Boolean).join(" + ");
const summaryLine = (r: Report, icons: boolean) => {
  const c = counts(r.outcomes);
  return ORDER.filter((s) => c[s]).map((s) => `${icons ? `${ICONS[s as Outcome["status"]]} ` : ""}${c[s]} ${s}`).join(icons ? " · " : ", ");
};
/** Most urgent first: status, then severity. */
const sorted = (outcomes: Outcome[]) =>
  [...outcomes].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || SEVERITY_ORDER.indexOf(a.rule.severity) - SEVERITY_ORDER.indexOf(b.rule.severity),
  );
const open = (o: Outcome) => o.status === "fail" || o.status === "warn" || o.status === "info";

export function toMarkdown(r: Report): string {
  const t = UI[r.language];
  const lang = r.language;
  const list = sorted(r.outcomes);
  const lines = [
    `## rechtzeitig: ${md(title(r))}`,
    "",
    summaryLine(r, true),
    "",
    `| | ${t.check} | ${t.severity} | ${t.result} |`,
    "|---|---|---|---|",
    ...list.map((o) => {
      const law = o.rule.legal_basis?.[lang];
      return `| ${ICONS[o.status]} | ${cell(o.rule.title[lang])}<br><sub>${o.rule.id}${law ? ` · ${cell(law)}` : ""}</sub> | ${o.rule.severity} | ${md(o.message)} |`;
    }),
    "",
  ];
  const withDetails = list.filter((o) => o.details.length || open(o));
  if (withDetails.length) {
    lines.push(`### ${t.details}`, "");
    for (const o of withDetails) {
      const fix = open(o) ? [`**${t.fix}:** ${o.rule.fix_hint[lang]}`, ""] : [];
      lines.push(`<details><summary>${ICONS[o.status]} ${o.rule.title[lang]} (${o.rule.id})</summary>`, "", ...fix, ...o.details.map((d) => `- ${md(d)}`), "", "</details>", "");
    }
  }
  lines.push(`### ${t.scan}`, "");
  if (r.web) {
    const w = r.web;
    lines.push(
      `- ${t.pages}: ${w.pages.map((p) => md(w.short(p.url))).join(", ")}`,
      `- ${t.language}: ${w.languages.join(", ")} · ${t.subscriptions}: ${w.subscriptions ? t.yes : t.no} · ${t.sales}: ${w.sales ? t.yes : t.no}`,
      `- ${t.visitor}${r.onGitHub ? `, ${t.runner}` : ""}`,
    );
  }
  if (r.repo) lines.push(`- ${t.repository(r.repo.files.length, r.repo.components.length, r.repo.lockfiles.length, r.repo.osv)}`);
  for (const w of r.warnings ?? []) lines.push(`- ⚠️ ${md(w)}`);
  lines.push(`- rechtzeitig ${r.version} · ${r.startedAt}`, "", `_${t.disclaimer}_`, "");
  return lines.join("\n");
}

export function toText(r: Report): string {
  const lines = [`rechtzeitig: ${plain(title(r))}`, ""];
  for (const o of r.outcomes) {
    lines.push(`${o.status.toUpperCase().padEnd(5)} ${o.id.padEnd(40)} ${plain(o.message)}`);
    for (const d of o.details) lines.push(`      - ${plain(d)}`);
  }
  lines.push("", ...(r.warnings ?? []).map((w) => `Warning: ${plain(w)}`), summaryLine(r, false));
  return lines.join("\n");
}

/**
 * Wraps log output so GitHub runs no workflow command from it, even if a line slipped through.
 * The token is random, so scanned content cannot end the block.
 */
export function withoutCommands(text: string, token = randomUUID()): string {
  return `::stop-commands::${token}\n${text}\n::${token}::`;
}
