// Known vulnerabilities from https://osv.dev (free, no key). Covers npm, Packagist, Pub, crates.io, PyPI and Go.

import type { Component, Vulnerability } from "../sdk.ts";

const API = "https://api.osv.dev/v1";
const BATCH = 1000;
const MAX_DETAILS = 100;

export async function queryOsv(components: Component[]): Promise<{ vulnerabilities: Vulnerability[]; status: string }> {
  try {
    const hits: Array<{ id: string; component: Component }> = [];
    for (let i = 0; i < components.length; i += BATCH) {
      const chunk = components.slice(i, i + BATCH);
      const res = await post("/querybatch", { queries: chunk.map((c) => ({ package: { purl: c.purl } })) });
      res.results.forEach((r: { vulns?: Array<{ id: string }> }, j: number) => {
        for (const v of r.vulns ?? []) hits.push({ id: v.id, component: chunk[j] });
      });
    }
    const ids = [...new Set(hits.map((h) => h.id))].slice(0, MAX_DETAILS);
    const details = new Map(await Promise.all(ids.map(async (id) => [id, await get(`/vulns/${id}`)] as const)));
    const vulnerabilities = hits.flatMap(({ id, component }) => {
      const d = details.get(id);
      if (!d) return [];
      const affected = d.affected?.find((a: any) => a.package?.name?.toLowerCase() === component.name.toLowerCase());
      const fixed = affected?.ranges?.flatMap((r: any) => r.events ?? []).find((e: any) => e.fixed)?.fixed;
      return [{
        id,
        purl: component.purl,
        summary: d.summary ?? d.details?.split("\n")[0]?.slice(0, 160) ?? "",
        severity: String(d.database_specific?.severity ?? "").toUpperCase(),
        fixed,
      }];
    });
    return { vulnerabilities, status: "ok" };
  } catch (e) {
    return { vulnerabilities: [], status: (e as Error).message };
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(API + path, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`OSV answered HTTP ${res.status}`);
  return res.json();
}

async function get(path: string) {
  const res = await fetch(API + path, { signal: AbortSignal.timeout(30_000) });
  return res.ok ? res.json() : undefined;
}
