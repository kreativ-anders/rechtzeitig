import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const subscriptions = true;

test("warns for a renewal by 12 months and a notice period of 3 months, with the sentence", async () => {
  const result = await runCheck(here, "long", { subscriptions });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["long_notice", "long_renewal"]);
  assert.match(result.details.join("\n"), /3 monate/);
});

test("passes for one month notice and an indefinite term; two weeks are less than a month", async () => {
  assert.equal((await runCheck(here, "short", { subscriptions })).status, "pass");
});

test("reads English T&Cs", async () => {
  const pages = { "/": { text: "Plan", links: [fakeLink("Terms and conditions", "https://example.de/terms")] }, "/terms": { text: "Your plan renews automatically for a further 12 months." } };
  const result = await runSite(here, pages, {}, { subscriptions, languages: ["en"] });
  assert.equal(result.status, "warn");
});

test("skips without a link to T&Cs", async () => {
  assert.equal((await runSite(here, { "/": { text: "Abo" } }, {}, { subscriptions })).status, "skip");
});

// Evidence gap: T&Cs linked but not loaded give info, never a pass.
test("gives info when the T&Cs are linked but could not be read", async () => {
  const result = await runSite(here, { "/": { text: "Abo", links: [fakeLink("AGB", "https://example.de/agb")] } }, {}, { subscriptions });
  assert.equal(result.status, "info");
});
