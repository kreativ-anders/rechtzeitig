import type { Outcome } from "./runner.ts";
import type { RepoContext, ScanContext } from "./sdk.ts";

export const ICONS: Record<Outcome["status"], string> = {
  fail: "❌",
  warn: "⚠️",
  error: "💥",
  pass: "✅",
  info: "ℹ️",
  skip: "⏭️",
};
const ORDER = Object.keys(ICONS);

export interface Report {
  web?: ScanContext;
  repo?: RepoContext;
  outcomes: Outcome[];
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
const title = (r: Report) => [r.web?.url, r.repo && `repository ${r.repo.root.split("/").pop()}`].filter(Boolean).join(" + ");
const summaryLine = (r: Report, icons: boolean) => {
  const c = counts(r.outcomes);
  return ORDER.filter((s) => c[s]).map((s) => `${icons ? `${ICONS[s as Outcome["status"]]} ` : ""}${c[s]} ${s}`).join(icons ? " · " : ", ");
};

export function toMarkdown(r: Report): string {
  const sorted = [...r.outcomes].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const lines = [
    `## vibecoda: ${title(r)}`,
    "",
    summaryLine(r, true),
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
  lines.push("### Scan", "");
  if (r.web) {
    const w = r.web;
    lines.push(
      `- Pages: ${w.pages.map((p) => `\`${w.short(p.url)}\``).join(", ")}`,
      `- Language: ${w.languages.join(", ")} · Subscriptions: ${w.subscriptions ? "yes" : "no"}`,
      `- Visitor: fresh browser, no clicks, no consent given${r.onGitHub ? ", GitHub-hosted runner (US data center)" : ""}`,
    );
  }
  if (r.repo) {
    lines.push(`- Repository: ${r.repo.files.length} files, ${r.repo.components.length} components from ${r.repo.lockfiles.length} lockfile(s), OSV: ${r.repo.osv}`);
  }
  lines.push(`- vibecoda ${r.version} · ${r.startedAt}`, "", "_Automated hints, not legal advice._", "");
  return lines.join("\n");
}

export function toText(r: Report): string {
  const lines = [`vibecoda: ${title(r)}`, ""];
  for (const o of r.outcomes) {
    lines.push(`${o.status.toUpperCase().padEnd(5)} ${o.id.padEnd(40)} ${o.message}`);
    for (const d of o.details) lines.push(`      - ${d}`);
  }
  lines.push("", summaryLine(r, false));
  return lines.join("\n");
}

export function toJson(r: Report): string {
  return JSON.stringify(
    {
      url: r.web?.url,
      repository: r.repo && { files: r.repo.files.length, components: r.repo.components.length, lockfiles: r.repo.lockfiles, osv: r.repo.osv },
      version: r.version,
      startedAt: r.startedAt,
      languages: r.web?.languages,
      subscriptions: r.web?.subscriptions,
      pages: r.web?.pages.map((p) => ({ url: p.url, status: p.js.status, statusWithoutJs: p.noJs.status })),
      counts: counts(r.outcomes),
      results: r.outcomes,
    },
    null,
    2,
  );
}
