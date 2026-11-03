import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { queryOsv } from "./osv.ts";
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
      affected: [{ package: { name }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.0.1" }] }] }],
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

test("reports a failed batch query as the status", async () => {
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  assert.deepEqual(await queryOsv([component("a")]), { vulnerabilities: [], status: "OSV answered HTTP 503" });
});
