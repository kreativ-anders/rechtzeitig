// Where findings go after a run. Today only into the local report artifact.
// A later upload (for history across runs) implements the same interface; nothing else changes.

import type { Outcome } from "./runner.ts";
import { oneLine } from "./text.ts";

/** What may leave the runner: rule ids, results and where they were found. No page text, no file contents. */
export interface Findings {
  version: string;
  startedAt: string;
  target: { url?: string; repository?: string };
  results: Array<{
    rule: string;
    check: string;
    severity: string;
    status: Outcome["status"];
    message: string;
    /** Pages, files with line numbers, hosts. Secrets are already redacted by the checks. */
    locations: string[];
  }>;
}

export interface FindingsSink {
  readonly name: string;
  send(findings: Findings): Promise<void>;
}

/** Default: findings stay in the artifact the workflow uploads. Sends nothing anywhere. */
export const artifactSink: FindingsSink = { name: "artifact", send: async () => {} };

export function toFindings(outcomes: Outcome[], meta: Omit<Findings, "results">): Findings {
  return {
    ...meta,
    results: outcomes.map((o) => ({
      rule: o.rule.id,
      check: o.id,
      severity: o.rule.severity,
      status: o.status,
      message: oneLine(o.message),
      locations: o.details.map((d) => oneLine(d)),
    })),
  };
}
