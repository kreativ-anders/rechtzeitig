// The findings as SARIF 2.1.0 for the input `sarif-upload`, which hands them to GitHub code scanning,
// so they show as alerts in the repository's Security tab.

import { createHash } from "node:crypto";
import type { Outcome, OutcomeStatus } from "./runner.ts";
import type { Severity } from "./rules.ts";
import { oneLine } from "./text.ts";
import { say, where, type Report } from "./report.ts";

const LEVEL: Partial<Record<OutcomeStatus, "error" | "warning" | "note">> = { fail: "error", error: "error", warn: "warning", info: "note" };
// GitHub sorts security alerts by this score (critical from 9.0, high from 7.0, medium from 4.0).
const SECURITY_SEVERITY: Record<Severity, string> = { critical: "9.5", high: "8.0", medium: "5.0", low: "2.0", info: "0.0" };
const DOCS = "https://rechtzeitig.dev/checks.html";

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

const hash = (...parts: (string | undefined)[]) => createHash("sha256").update(parts.map((p) => p ?? "").join("\0")).digest("hex");
const location = (uri: string, line?: number) => ({
  physicalLocation: { artifactLocation: { uri, uriBaseId: "%SRCROOT%" }, region: { startLine: line && line > 0 ? line : 1 } },
});

export function toSarif(r: Report, { base = "", anchor }: SarifOptions = {}): object {
  const lang = r.language;
  const open = r.outcomes.filter((o) => LEVEL[o.status]);
  const rules = [...new Map(open.map((o) => [o.rule.id, o])).values()].map((o) => ({
    id: o.rule.id,
    name: o.id,
    shortDescription: { text: o.rule.title[lang] },
    help: { text: [o.rule.fix_hint[lang], o.rule.legal_basis?.[lang]].filter(Boolean).join("\n\n") },
    helpUri: `${DOCS}#${o.rule.id}`,
    properties: {
      tags: [o.id.split("/")[0]],
      ...(o.rule.id.startsWith("SEC-") ? { "security-severity": SECURITY_SEVERITY[o.rule.severity] } : {}),
    },
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "rechtzeitig", version: r.version, informationUri: "https://rechtzeitig.dev/", rules } },
      results: open.flatMap((o) => results(o, r, base, anchor)),
    }],
  };
}

function results(o: Outcome, r: Report, base: string, anchor?: string) {
  const level = LEVEL[o.status]!;
  const message = oneLine(say(o, r.language));
  const texts = where(o, r.language).map((t) => oneLine(t));
  const inFiles = o.details.flatMap((d, i) => (typeof d !== "string" && d.file ? [{ d, text: texts[i] }] : []));
  const seen = new Map<string, number>();
  const fileResults = inFiles.map(({ d, text }) => {
    const uri = base ? `${base}/${d.file}` : d.file!;
    // The fingerprint leaves out the line, so an alert stays the same alert when code moves.
    const key = hash(o.rule.id, uri, d.key, JSON.stringify(d.params ?? d.text ?? ""));
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return {
      ruleId: o.rule.id, level,
      message: { text: `${message}\n${text}` },
      locations: [location(uri, d.line)],
      partialFingerprints: { "rechtzeitig/v1": `${key}:${n}` },
    };
  });
  if (fileResults.length) return fileResults;
  // Website findings and findings without a file: one alert per rule, at the workflow file.
  return [{
    ruleId: o.rule.id, level,
    message: { text: [r.web ? `${message} (${oneLine(r.web.url)})` : message, ...texts.map((t) => `- ${t}`)].join("\n") },
    ...(anchor ? { locations: [location(anchor)] } : {}),
    partialFingerprints: { "rechtzeitig/v1": hash(o.rule.id, o.id, r.web?.url) },
  }];
}
