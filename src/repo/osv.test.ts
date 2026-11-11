import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { fixedFor, queryOsv } from "./osv.ts";
import type { Component } from "../sdk.ts";

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

const component = (name: string): Component => ({ ecosystem: "npm", name, version: "1.0.0", purl: `pkg:npm/${name}@1.0.0`, dev: false, source: "package-lock.json" });

/** Answers the batch query with one id per component; `missing` ids answer 404 on the detail request. */
function stubOsv(missing: string[] = []) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/querybatch")) {
      const { queries } = JSON.parse(String(init?.body));
      const results = queries.map((q: { package: { purl: string } }) => ({ vulns: [{ id: `OSV-${q.package.purl.split("/")[1].split("@")[0]}` }] }));
      return Response.json({ results });
    }
    const id = decodeURIComponent(url.split("/vulns/")[1]);
    if (missing.includes(id)) return new Response("not found", { status: 404 });
    const name = id.slice(4);
    return Response.json({
      id,
      summary: `Issue in ${name}`,
      database_specific: { severity: "high" },
      affected: [{ package: { name }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "1.0.1" }] }] }],
    });
  }) as typeof fetch;
}

test("fills summary, severity and fixed version from the details", async () => {
  stubOsv();
  const { vulnerabilities, status } = await queryOsv([component("a")]);
  assert.equal(status, "ok");
  assert.deepEqual(vulnerabilities, [{ id: "OSV-a", purl: "pkg:npm/a@1.0.0", summary: "Issue in a", severity: "HIGH", fixed: "1.0.1" }]);
});

test("keeps a hit whose details could not be loaded", async () => {
  stubOsv(["OSV-b"]);
  const { vulnerabilities, status } = await queryOsv([component("a"), component("b")]);
  assert.equal(status, "ok (details for 1 of 2)");
  assert.deepEqual(vulnerabilities.map((v) => [v.id, v.severity]), [["OSV-a", "HIGH"], ["OSV-b", ""]]);
});

test("keeps hits beyond the detail limit", async () => {
  stubOsv();
  const { vulnerabilities, status } = await queryOsv(Array.from({ length: 101 }, (_, i) => component(`p${i}`)));
  assert.equal(vulnerabilities.length, 101);
  assert.equal(status, "ok (details for 100 of 101)");
});

// Structure of GHSA-f82v-jwr5-mffw on osv.dev: one affected entry per release branch of next.
const branches = (id: string) => ({
  id,
  summary: "Authorization bypass in Next.js middleware",
  affected: [
    ["13.0.0", "13.5.9"],
    ["14.0.0", "14.2.25"],
    ["15.0.0", "15.2.3"],
    ["12.0.0", "12.3.5"],
  ].map(([introduced, fixed]) => ({ package: { name: "next", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced }, { fixed }] }] })),
});

/** Answers every component with one id and `record` as its details. */
function stubRecord(record: (id: string) => unknown) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/querybatch")) return Response.json({ results: JSON.parse(String(init?.body)).queries.map(() => ({ vulns: [{ id: "GHSA-1" }] })) });
    return Response.json(record(decodeURIComponent(url.split("/vulns/")[1])));
  }) as typeof fetch;
}

const versioned = (name: string, version: string): Component => ({ ...component(name), version, purl: `pkg:npm/${name}@${version}` });

test("takes the fixed version of the release branch the installed version is on", async () => {
  stubRecord(branches);
  const { vulnerabilities } = await queryOsv([versioned("next", "15.2.2"), versioned("next", "14.2.10"), versioned("next", "13.5.1"), versioned("next", "12.1.0")]);
  assert.deepEqual(vulnerabilities.map((v) => v.fixed), ["15.2.3", "14.2.25", "13.5.9", "12.3.5"]);
});

test("shows no fixed version when no interval holds the version or it cannot be compared", async () => {
  stubRecord(branches);
  const { vulnerabilities } = await queryOsv([versioned("next", "15.2.3"), versioned("next", "11.0.0"), versioned("next", "canary")]);
  assert.deepEqual(vulnerabilities.map((v) => v.fixed), [undefined, undefined, undefined]);
});

test("fixedFor: ordered events, last_affected, pre-releases and GIT ranges", () => {
  const range = { type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "1.2.0" }, { introduced: "2.0.0-rc.1" }, { fixed: "2.0.5" }, { introduced: "3.0" }, { last_affected: "3.1" }] };
  assert.equal(fixedFor("1.1.9", range), "1.2.0");
  assert.equal(fixedFor("1.5.0", range), undefined);
  assert.equal(fixedFor("2.0.0-rc.2", range), "2.0.5");
  assert.equal(fixedFor("2.0.0-beta", range), undefined);
  assert.equal(fixedFor("3.0.4", range), undefined);
  assert.equal(fixedFor("v2.0.1", { ...range, events: [...range.events].reverse() }), "2.0.5");
  assert.equal(fixedFor("1.0.0", { type: "GIT", events: [{ introduced: "0" }, { fixed: "abc123" }] }), undefined);
  assert.equal(fixedFor("1.0.0", { events: [{ introduced: "0" }, { fixed: "1.0.1" }] }), undefined);
});

test("reports a failed batch query as the status", async () => {
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  assert.deepEqual(await queryOsv([component("a")]), { vulnerabilities: [], status: "OSV answered HTTP 503" });
});
