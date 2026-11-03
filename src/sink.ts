// Where findings go after a run: always into the local report artifact, and to an HTTPS endpoint
// only when the user sets both upload-url and upload-token.

import type { Outcome } from "./runner.ts";

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

/** POSTs the findings as JSON with a bearer token. HTTPS only; plain HTTP is allowed for localhost (tests, local servers). */
export function httpSink(url: string, token: string, timeoutMs = 30_000): FindingsSink {
  const target = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (target.protocol !== "https:" && !(local && target.protocol === "http:")) {
    throw new Error(`upload-url must use https: ${target.origin}`);
  }
  return {
    name: target.host,
    async send(findings) {
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "user-agent": `rechtzeitig/${findings.version}` },
        body: JSON.stringify(findings),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${target.host} answered ${response.status} ${response.statusText}`);
    },
  };
}

/** Picks the sink from the inputs. Only one of url and token set is a mistake, not a silent skip. */
export function chooseSink(url: string | undefined, token: string | undefined): FindingsSink {
  if (!url && !token) return artifactSink;
  if (!url || !token) throw new Error("Set both upload-url and upload-token, or neither.");
  return httpSink(url, token);
}

export function toFindings(outcomes: Outcome[], meta: Omit<Findings, "results">): Findings {
  return {
    ...meta,
    results: outcomes.map((o) => ({
      rule: o.rule.id,
      check: o.id,
      severity: o.rule.severity,
      status: o.status,
      message: o.message,
      locations: o.details,
    })),
  };
}
