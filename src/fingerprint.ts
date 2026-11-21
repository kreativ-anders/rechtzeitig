// Stable ids for findings, shared by the report JSON (src/report.ts) and SARIF (src/sarif.ts), so a tool on top of
// the JSON and a code scanning alert name the same finding the same way. Leaves out the line and the shown text:
// a finding stays the same finding when code moves or a message is reworded.

import { createHash } from "node:crypto";
import type { Finding } from "./sdk.ts";
import type { Outcome } from "./runner.ts";

export const hash = (...parts: (string | undefined)[]) => createHash("sha256").update(parts.map((p) => p ?? "").join("\0")).digest("hex");

/** Path of a finding's file as SARIF names it: below the scanned repository's folder `base` ("" = the checkout). */
export const uriOf = (file: string, base = "") => (base ? `${base}/${file}` : file);

/**
 * One fingerprint per detail of an outcome: rule id, file (none for website findings), message key, and the
 * finding's own `fingerprint` or else its params (or value). The same detail twice gets ":2", ":3", in order.
 * For details with a file this is the value of SARIF's partialFingerprints "rechtzeitig/v1".
 */
export function fingerprints(o: Outcome, base = ""): string[] {
  const seen = new Map<string, number>();
  return o.details.map((detail) => {
    const d: Finding = typeof detail === "string" ? { text: detail } : detail;
    const key = hash(o.rule.id, d.file ? uriOf(d.file, base) : "", d.key, d.fingerprint ?? JSON.stringify(d.params ?? d.text ?? ""));
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${key}:${n}`;
  });
}
