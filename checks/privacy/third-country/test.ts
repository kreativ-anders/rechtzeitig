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
  assert.deepEqual(result.details, ["Hosting provider not recognized from the response headers (data/hosting.yml); its country was not checked.", "Google Fonts (US)"]);
});

// Start page with a privacy link and the given requests; the policy says nothing about third countries.
function site(requests: Request[], countries: Record<string, string> = {}, headers: Record<string, string> = {}, text = "Datenschutz. Wir nutzen Dienste.") {
  const policy = { ...emptySnapshot("https://example.de/datenschutz"), status: 200, text };
  const link = { href: policy.finalUrl, text: "Datenschutz", label: "datenschutz", area: "footer" as const, button: false };
  const home = { ...emptySnapshot("https://example.de/"), status: 200, links: [link], requests, headers };
  const start = { url: home.finalUrl, noJs: home, js: home };
  return rendered(here, check.run(fakeContext(home, { start, pages: [start, { url: policy.finalUrl, noJs: policy, js: policy }], countries })) as Result);
}

test("the vendor's country wins over the IP country of an edge server", async () => {
  const result = await site([{ url: "https://fonts.googleapis.com/css", host: "fonts.googleapis.com", type: "stylesheet" }], { "fonts.googleapis.com": "DE" });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Hosting provider not recognized from the response headers (data/hosting.yml); its country was not checked.", "Google Fonts (US)"]);
});

test("gives info, not pass, when no country is known", async () => {
  const result = await site([{ url: "https://cdn.unknown-host.net/a.js", host: "cdn.unknown-host.net", type: "script" }]);
  assert.equal(result.status, "info");
  assert.match(result.details?.[1] ?? "", /unknown-host\.net/);
});

test("passes when a known country is inside the EEA", async () => {
  const result = await site([{ url: "https://cdn.unknown-host.net/a.js", host: "cdn.unknown-host.net", type: "script" }], { "cdn.unknown-host.net": "DE" });
  assert.equal(result.status, "pass");
});

test("passes without third-party services, saying the host was not recognized", async () => {
  const result = await site([]);
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "no_services");
  assert.match(result.details?.[0] ?? "", /not recognized/);
});

test("warns when the site's own host is outside the EEA and the policy says nothing about third countries", async () => {
  const result = await runCheck(here, "host-uncovered");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.key, "host_not_covered");
  assert.match(result.message, /Vercel \(US\)/);
  assert.match(result.details?.[0] ?? "", /Vercel.*US.*x-vercel-id/);
});

test("passes when the policy covers the transfer to the host's country", async () => {
  const result = await runCheck(here, "host-covered");
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "covered");
});

const github = { "x-github-request-id": "3730:1B75", server: "GitHub.com", "x-fastly-request-id": "e7c8", "x-served-by": "cache-muc13957-MUC" };

test("names the platform, not the CDN in front of it, and lists the host's own services once", async () => {
  const result = await site([{ url: "https://api.github.com/repos/a/b", host: "api.github.com", type: "fetch" }], {}, github);
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.params?.name, "GitHub Pages");
  assert.equal(result.details?.length, 1);
});

test("the provider's company country wins over the IP country of its edge server", async () => {
  const result = await site([], { "example.de": "DE" }, github);
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.key, "host_not_covered");
});

test("gives info, not a warning, when only the own server's IP country is outside the EEA", async () => {
  const result = await site([], { "example.de": "US" });
  assert.equal(result.status, "info");
  assert.equal(result.raw.message.key, "host_ip_outside");
  const covered = await site([], { "example.de": "US" }, {}, "Die Server stehen in den USA (Data Privacy Framework).");
  assert.equal(covered.status, "pass");
});

test("passes for a host inside the EEA, even when its edge server's IP country is not", async () => {
  const result = await site([], { "example.de": "US" }, { server: "BunnyCDN-DE1-1332", "cdn-pullzone": "1" });
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "none_outside");
});

test("passes when the own server's IP country is inside the EEA", async () => {
  const result = await site([], { "example.de": "DE" });
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "none_outside");
  assert.match(result.details?.[0] ?? "", /example\.de is in DE by its IP address/);
});
