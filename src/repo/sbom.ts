// CycloneDX 1.6 SBOM from the repository scan.

import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Component, RepoContext } from "../sdk.ts";

/** Unique per component and lockfile; the same package in two lockfiles stays two entries. */
export const componentRef = (c: Pick<Component, "purl" | "source">) => `${c.purl}|${c.source}`;

export function toCycloneDx(repo: RepoContext, version: string): string {
  const byPurl = Map.groupBy(repo.components, (c) => c.purl);
  const components = repo.components.map((c) => ({
    type: "library",
    "bom-ref": componentRef(c),
    name: c.name,
    version: c.version,
    purl: c.purl,
    scope: c.dev ? "optional" : "required",
    ...(c.license ? { licenses: [license(c.license)] } : {}),
    properties: [{ name: "rechtzeitig:source", value: c.source }],
  }));
  const vulnerabilities = repo.vulnerabilities.map((v) => ({
    id: v.id,
    source: { name: "OSV", url: `https://osv.dev/vulnerability/${v.id}` },
    ...(v.severity ? { ratings: [{ severity: v.severity.toLowerCase().replace("moderate", "medium") }] } : {}),
    description: v.summary,
    affects: (byPurl.get(v.purl) ?? []).map((c) => ({ ref: componentRef(c) })),
  }));
  return JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: `urn:uuid:${randomUUID()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: { components: [{ type: "application", name: "rechtzeitig", version }] },
        component: { type: "application", name: basename(repo.root), ...(repo.license ? { licenses: [license(repo.license)] } : {}) },
      },
      components,
      vulnerabilities,
    },
    null,
    2,
  );
}

// SPDX expressions go in as expressions, anything else ("SEE LICENSE IN ...") as a name.
const license = (value: string) => (/^[\w.+-]+( (AND|OR|WITH) [\w.+-]+)*$/.test(value) ? { expression: value } : { license: { name: value } });
