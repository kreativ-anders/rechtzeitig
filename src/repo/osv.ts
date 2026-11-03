// Known vulnerabilities from https://osv.dev (free, no key). Covers npm, Packagist, Pub, crates.io, PyPI and Go.

import type { Component, Vulnerability } from "../sdk.ts";

const API = "https://api.osv.dev/v1";
const BATCH = 1000;
const MAX_DETAILS = 100;
const TIMEOUT = 30_000;

/** The parts of an OSV record rechtzeitig reads. https://ossf.github.io/osv-schema/ */
export interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  affected?: Array<{ package?: { name?: string }; ranges?: Array<{ events?: Array<{ fixed?: string }> }> }>;
  database_specific?: { severity?: string };
}

interface OsvBatch {
  results: Array<{ vulns?: Array<{ id: string }> }>;
}

/**
 * Every hit is kept. Summary, severity and fixed version come from a second request per id,
 * made for at most MAX_DETAILS ids; the status says when some are missing.
 */
export async function queryOsv(components: Component[]): Promise<{ vulnerabilities: Vulnerability[]; status: string }> {
  try {
    const hits: Array<{ id: string; component: Component }> = [];
    for (let i = 0; i < components.length; i += BATCH) {
      const chunk = components.slice(i, i + BATCH);
      const res = await request<OsvBatch>("/querybatch", { queries: chunk.map((c) => ({ package: { purl: c.purl } })) });
      res.results.forEach((r, j) => {
        for (const v of r.vulns ?? []) hits.push({ id: v.id, component: chunk[j] });
      });
    }
    const ids = [...new Set(hits.map((h) => h.id))];
    const fetched = await Promise.all(ids.slice(0, MAX_DETAILS).map((id) => request<OsvVuln>(`/vulns/${encodeURIComponent(id)}`).catch(() => undefined)));
    const details = new Map(fetched.filter((d) => d !== undefined).map((d) => [d.id, d]));
    const vulnerabilities = hits.map(({ id, component }) => toVulnerability(id, component, details.get(id)));
    const status = details.size < ids.length ? `ok (details for ${details.size} of ${ids.length})` : "ok";
    return { vulnerabilities, status };
  } catch (e) {
    return { vulnerabilities: [], status: (e as Error).message };
  }
}

function toVulnerability(id: string, component: Component, d: OsvVuln | undefined): Vulnerability {
  if (!d) return { id, purl: component.purl, summary: "", severity: "" };
  const affected = d.affected?.find((a) => a.package?.name?.toLowerCase() === component.name.toLowerCase());
  const fixed = affected?.ranges?.flatMap((r) => r.events ?? []).find((e) => e.fixed)?.fixed;
  return {
    id,
    purl: component.purl,
    summary: d.summary ?? d.details?.split("\n")[0]?.slice(0, 160) ?? "",
    severity: String(d.database_specific?.severity ?? "").toUpperCase(),
    fixed,
  };
}

/** GET without a body, POST with one. Throws on a non-OK answer. */
async function request<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = body === undefined ? {} : { method: "POST", body: JSON.stringify(body) };
  const res = await fetch(API + path, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`OSV answered HTTP ${res.status}`);
  return (await res.json()) as T;
}
