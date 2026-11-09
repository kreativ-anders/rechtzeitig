import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const requests = (...urls: string[]) => ({ requests: urls.map((url) => ({ url, host: new URL(url).hostname, type: "image" })) });

test("passes when a real page's Google tag reports storage as denied", async () => {
  const result = await runCheck(here, "denied");
  assert.equal(result.status, "pass");
});

test("fails when a request reports storage as granted before a choice", async () => {
  const result = await runFake(
    here,
    requests(
      "https://region1.google-analytics.com/g/collect?v=2&gcs=G111",
      "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/?gcs=G100",
    ),
  );
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["region1.google-analytics.com/g/collect on /, gcs=G111"]);
});

test("fails for a TCF string before a choice", async () => {
  const result = await runFake(here, requests("https://www.googleadservices.com/pagead/conversion/1/?gcs=G100&gdpr=1&gdpr_consent=CPx_abc"));
  assert.equal(result.status, "fail");
  assert.match(result.message, /TCF/);
});

test("ignores an unfilled TCF macro", async () => {
  const result = await runFake(here, requests("https://ad.doubleclick.net/activity;src=1?gcs=G100&gdpr_consent=${GDPR_CONSENT_755}"));
  assert.equal(result.status, "pass");
});

test("warns when a request carries no consent state", async () => {
  const result = await runFake(here, requests("https://www.google-analytics.com/g/collect?v=2&gcd=13l3l3l3l1", "https://www.google-analytics.com/g/collect?v=2&gcs=G1--"));
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 2);
});

test("skips without Google tag requests", async () => {
  const result = await runFake(here, requests("https://www.googletagmanager.com/gtag/js?id=G-TEST", "https://fonts.googleapis.com/css2?family=Inter"));
  assert.equal(result.status, "skip");
});

test("one granted storage type is enough to fail", async () => {
  assert.equal((await runFake(here, requests("https://www.google-analytics.com/g/collect?gcs=G101"))).status, "fail");
  assert.equal((await runFake(here, requests("https://www.google-analytics.com/g/collect?gcs=G110"))).status, "fail");
  assert.equal((await runFake(here, requests("https://www.google-analytics.com/g/collect?gcs=G100"))).status, "pass");
});

// Every endpoint in data/google-tags.yml, on the host itself and on a subdomain.
test("reads every Google tag endpoint", async () => {
  const urls = [
    "https://google-analytics.com/g/collect", "https://www.google-analytics.com/j/collect", "https://www.google-analytics.com/r/collect",
    "https://www.google-analytics.com/collect", "https://analytics.google.com/g/collect", "https://stats.g.doubleclick.net/g/collect",
    "https://stats.g.doubleclick.net/j/collect", "https://googleads.g.doubleclick.net/pagead/x", "https://ad.doubleclick.net/activity;src=1",
    "https://ad.doubleclick.net/ddm/x", "https://www.googleadservices.com/pagead/conversion", "https://www.google.com/pagead/1p-user-list",
    "https://www.google.com/ccm/collect",
  ];
  for (const url of urls) assert.equal((await runFake(here, requests(`${url}?gcs=G100`))).status, "pass", url);
  assert.equal((await runFake(here, requests("https://www.google.com/search?gcs=G111"))).status, "skip");
});
