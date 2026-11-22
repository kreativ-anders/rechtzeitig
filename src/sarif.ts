// The findings as SARIF 2.1.0 for the input `sarif-upload`, which hands them to GitHub code scanning,
// so they show as alerts in the repository's Security tab.

import type { Outcome, OutcomeStatus } from "./runner.ts";
import type { Severity } from "./rules.ts";
import { oneLine } from "./text.ts";
import { render } from "./messages.ts";
import { say, where, type Report } from "./report.ts";
import { WIKI, ruleUrl } from "./wiki.ts";
import { fingerprints, hash, uriOf } from "./fingerprint.ts";

const LEVEL: Partial<Record<OutcomeStatus, "error" | "warning" | "note">> = { fail: "error", error: "error", warn: "warning", info: "note" };
// GitHub sorts security alerts by this score (critical from 9.0, high from 7.0, medium from 4.0).
const SECURITY_SEVERITY: Record<Severity, string> = { critical: "9.5", high: "8.0", medium: "5.0", low: "2.0", info: "0.0" };

export interface SarifOptions {
  /** Scanned repository's folder relative to the checkout ("" when it is the checkout). */
  base?: string;
  /** File for findings without one (website findings), relative to the checkout: the workflow file. */
  anchor?: string;
}

/** Path of the running workflow file from GITHUB_WORKFLOW_REF ("owner/repo/.github/workflows/x.yml@refs/..."). */
export function workflowFile(ref = process.env.GITHUB_WORKFLOW_REF, repository = process.env.GITHUB_REPOSITORY): string | undefined {
  if (!ref || !repository || !ref.startsWith(`${repository}/`)) return undefined;
  return ref.slice(repository.length + 1).replace(/@.*$/, "") || undefined;
}

const location = (uri: string, line?: number) => ({
  physicalLocation: { artifactLocation: { uri, uriBaseId: "%SRCROOT%" }, region: { startLine: line && line > 0 ? line : 1 } },
});

/** The status that sets the level: for a suppressed rule the one it would have without its entry. */
const levelOf = (o: Outcome) => LEVEL[o.suppression?.status ?? o.status];

export function toSarif(r: Report, { base = "", anchor }: SarifOptions = {}): object {
  const open = r.outcomes.filter((o) => levelOf(o));
  const rules = [...new Map(open.map((o) => [o.rule.id, o])).values()].map((o) => ({
    id: o.rule.id,
    name: o.id,
    shortDescription: { text: o.rule.title },
    help: { text: [o.rule.fix_hint, o.rule.legal_basis ?? (o.rule.value ? `${render({ key: "no_legal_basis" }, "report")}: ${o.rule.value}` : undefined)].filter(Boolean).join("\n\n") },
    helpUri: ruleUrl(o.id, o.rule.id),
    properties: {
      tags: [o.id.split("/")[0]],
      ...(o.rule.id.startsWith("SEC-") ? { "security-severity": SECURITY_SEVERITY[o.rule.severity] } : {}),
    },
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "rechtzeitig", version: r.version, informationUri: WIKI, rules } },
      results: open.flatMap((o) => results(o, r, base, anchor)),
    }],
  };
}

function results(o: Outcome, r: Report, base: string, anchor?: string) {
  const level = levelOf(o)!;
  // A rule turned off in .github/rechtzeitig.yml keeps its results, marked as suppressed with the reason (SARIF 2.1.0 § 3.35).
  const s = o.suppression;
  const suppressions = s
    ? { suppressions: [{ kind: "external", status: "accepted", justification: oneLine(`${s.category}: ${s.reason}`), location: location(base ? `${base}/${s.file}` : s.file, s.line) }] }
    : {};
  const message = oneLine(say(o));
  const texts = where(o).map((t) => oneLine(t));
  // The fingerprint leaves out the line, so an alert stays the same alert when code moves (src/fingerprint.ts).
  const prints = fingerprints(o, base);
  const inFiles = o.details.flatMap((d, i) => (typeof d !== "string" && d.file ? [{ d, text: texts[i], print: prints[i] }] : []));
  const fileResults = inFiles.map(({ d, text, print }) => {
    return {
      ruleId: o.rule.id, level,
      message: { text: `${message}\n${text}` },
      locations: [location(uriOf(d.file!, base), d.line)],
      partialFingerprints: { "rechtzeitig/v1": print },
      ...suppressions,
    };
  });
  if (fileResults.length) return fileResults;
  // Website findings and findings without a file: one alert per rule, at the workflow file.
  return [{
    ruleId: o.rule.id, level,
    message: { text: [r.web ? `${message} (${oneLine(r.web.url)})` : message, ...texts.map((t) => `- ${t}`)].join("\n") },
    ...(anchor ? { locations: [location(anchor)] } : {}),
    partialFingerprints: { "rechtzeitig/v1": hash(o.rule.id, o.id, r.web?.url) },
    ...suppressions,
  }];
}
