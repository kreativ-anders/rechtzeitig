import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext, rendered, runCheck } from "../../../test/helpers.ts";
import { emptySnapshot } from "../../../src/capture.ts";
import type { Request, Result } from "../../../src/sdk.ts";
import check from "./check.ts";

const here = import.meta.dirname;

test("passes when the policy mentions the USA", async () => {
  assert.equal((await runCheck(here, "named")).status, "pass");
});

test("warns when a US service is used but not explained", async () => {
  const result = await runCheck(here, "unnamed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts (US)"]);
});

// Start page with a privacy link and the given requests; the policy says nothing about third countries.
function site(requests: Request[], countries: Record<string, string> = {}) {
  const policy = { ...emptySnapshot("https://example.de/datenschutz"), status: 200, text: "Datenschutz. Wir nutzen Dienste." };
  const link = { href: policy.finalUrl, text: "Datenschutz", label: "datenschutz", area: "footer" as const, button: false };
  const home = { ...emptySnapshot("https://example.de/"), status: 200, links: [link], requests };
  const start = { url: home.finalUrl, noJs: home, js: home };
  return rendered(here, check.run(fakeContext(home, { start, pages: [start, { url: policy.finalUrl, noJs: policy, js: policy }], countries })) as Result);
}

test("the vendor's country wins over the IP country of an edge server", async () => {
  const result = await site([{ url: "https://fonts.googleapis.com/css", host: "fonts.googleapis.com", type: "stylesheet" }], { "fonts.googleapis.com": "DE" });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts (US)"]);
});

test("gives info, not pass, when no country is known", async () => {
  const result = await site([{ url: "https://cdn.unknown-host.net/a.js", host: "cdn.unknown-host.net", type: "script" }]);
  assert.equal(result.status, "info");
  assert.match(result.details?.[0] ?? "", /unknown-host\.net/);
});

test("passes when a known country is inside the EEA", async () => {
  const result = await site([{ url: "https://cdn.unknown-host.net/a.js", host: "cdn.unknown-host.net", type: "script" }], { "cdn.unknown-host.net": "DE" });
  assert.equal(result.status, "pass");
});
