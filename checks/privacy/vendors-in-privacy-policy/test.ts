import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the policy names Google Fonts", async () => {
  assert.equal((await runCheck(here, "named")).status, "pass");
});

test("warns when the policy does not name it", async () => {
  const result = await runCheck(here, "unnamed");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Google Fonts"]);
});

test("matches whole words, and names unknown services by their domain", async () => {
  // "Metadaten" is not "Meta"; "Cookies" is not "co" from shop.co.uk.
  const result = await runCheck(here, "partial-words");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Meta Pixel", "shop.co.uk"]);
});

test("skips without a privacy policy", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});

// Start page linking a privacy policy with the given text, loading from the given URLs.
const policy = (text: string, ...urls: string[]) => runSite(here, {
  "/": { links: [fakeLink("Datenschutz", "https://example.de/datenschutz", "footer")], requests: urls.map((url) => ({ url, host: new URL(url).hostname, type: "script" })) },
  "/datenschutz": { text },
});

test("passes without services of other sites", async () => {
  const result = await policy("Datenschutzerklärung");
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.key, "no_services");
});

test("any of a vendor's names counts, and unknown services by their domain name", async () => {
  assert.equal((await policy("Wir nutzen Typekit.", "https://use.typekit.net/a.css")).status, "pass");
  assert.equal((await policy("Wir nutzen example-cdn.", "https://cdn.example-cdn.net/a.js")).status, "pass");
});

// Issue #40: payment vendors from data/third-parties.yml are matched by host and named in the policy.
test("warns when Mollie is contacted but not named in the policy", async () => {
  const result = await policy("Datenschutzerklärung", "https://js.mollie.com/v1/mollie.js");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Mollie"]);
});

test("passes when the policy names Klarna", async () => {
  const result = await policy("Zahlungen über Klarna.", "https://x.klarnacdn.net/kp/1.0.0/klarna.js");
  assert.equal(result.status, "pass");
});

// Issue #40: newsletter vendors from data/third-parties.yml are matched by host.
test("warns when Brevo forms are contacted but not named in the policy", async () => {
  const result = await policy("Datenschutzerklärung", "https://sibforms.com/forms/end-form/123.js");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["Brevo"]);
});

// "No evidence means pass" review: services loaded by scripts on a page whose JavaScript load failed are unknown.
test("no pass when a page did not load with JavaScript", async () => {
  const { failedJsPage, fakeContext, fakeLink, fakePage, rendered } = await import("../../../test/helpers.ts");
  const { default: check } = await import("./check.ts");
  const start = fakePage("https://example.de/", { links: [fakeLink("Datenschutz", "https://example.de/datenschutz")] });
  const policy = fakePage("https://example.de/datenschutz", { text: "Datenschutzerklärung" });
  const blog = failedJsPage("https://example.de/blog");
  assert.equal(rendered(here, await check.run(fakeContext(start.js, { start, pages: [start, policy] }))).status, "pass");
  const result = rendered(here, await check.run(fakeContext(start.js, { start, pages: [start, policy, blog] })));
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["/blog: load with JavaScript failed (Timeout)"]);
});

// Issue #40: analytics and advertising vendors from data/third-parties.yml are matched by host.
test("warns when etracker and the Pinterest Tag are contacted but not named in the policy", async () => {
  const result = await policy("Datenschutzerklärung", "https://code.etracker.com/code/e.js", "https://s.pinimg.com/ct/core.js");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["etracker", "Pinterest Tag"]);
});
