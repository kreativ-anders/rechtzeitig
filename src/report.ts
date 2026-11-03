import type { Outcome } from "./runner.ts";
import type { ScanContext } from "./sdk.ts";

export const ICONS: Record<Outcome["status"], string> = {
  fail: "❌",
  warn: "⚠️",
  error: "💥",
  pass: "✅",
  info: "ℹ️",
  skip: "⏭️",
};
const ORDER = Object.keys(ICONS);

export interface ReportMeta {
  version: string;
  startedAt: string;
  onGitHub: boolean;
}

export function counts(outcomes: Outcome[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const s of ORDER) c[s] = outcomes.filter((o) => o.status === s).length;
  return c;
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function toMarkdown(ctx: ScanContext, outcomes: Outcome[], meta: ReportMeta): string {
  const c = counts(outcomes);
  const sorted = [...outcomes].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const lines = [
    `## vibecoda: ${ctx.url}`,
    "",
    ORDER.filter((s) => c[s]).map((s) => `${ICONS[s as Outcome["status"]]} ${c[s]} ${s}`).join(" · "),
    "",
    "| | Check | Result |",
    "|---|---|---|",
    ...sorted.map((o) => `| ${ICONS[o.status]} | ${cell(o.title)}<br><sub>${o.id}${o.law ? ` · ${cell(o.law)}` : ""}</sub> | ${cell(o.message)} |`),
    "",
  ];
  const withDetails = sorted.filter((o) => o.details.length);
  if (withDetails.length) {
    lines.push("### Details", "");
    for (const o of withDetails) {
      lines.push(`<details><summary>${ICONS[o.status]} ${o.title}</summary>`, "", ...o.details.map((d) => `- ${d}`), "", "</details>", "");
    }
  }
  lines.push(
    "### Scan",
    "",
    `- Pages: ${ctx.pages.map((p) => `\`${ctx.short(p.url)}\``).join(", ")}`,
    `- Language: ${ctx.languages.join(", ")} · Subscriptions: ${ctx.subscriptions ? "yes" : "no"}`,
    `- Visitor: fresh browser, no clicks, no consent given${meta.onGitHub ? ", GitHub-hosted runner (US data center)" : ""}`,
    `- vibecoda ${meta.version} · ${meta.startedAt}`,
    "",
    "_Automated hints, not legal advice._",
    "",
  );
  return lines.join("\n");
}

export function toText(ctx: ScanContext, outcomes: Outcome[]): string {
  const lines = [`vibecoda: ${ctx.url}`, ""];
  for (const o of outcomes) {
    lines.push(`${o.status.toUpperCase().padEnd(5)} ${o.id.padEnd(40)} ${o.message}`);
    for (const d of o.details) lines.push(`      - ${d}`);
  }
  const c = counts(outcomes);
  lines.push("", ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${s}`).join(", "));
  return lines.join("\n");
}

export function toJson(ctx: ScanContext, outcomes: Outcome[], meta: ReportMeta): string {
  return JSON.stringify(
    {
      url: ctx.url,
      ...meta,
      languages: ctx.languages,
      subscriptions: ctx.subscriptions,
      pages: ctx.pages.map((p) => ({ url: p.url, status: p.js.status, statusWithoutJs: p.noJs.status })),
      counts: counts(outcomes),
      results: outcomes,
    },
    null,
    2,
  );
}
