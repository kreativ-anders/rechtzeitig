import { test } from "node:test";
import assert from "node:assert/strict";
import { failedJsPage, fakePage, fakeLink, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("warns for a shaming refusal in a newsletter pop-up", async () => {
  const result = await runCheck(here, "popup");
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /Nein danke, ich brauche keine Rabatte/);
});

test("passes for a neutral refusal", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("leaves consent banner buttons to privacy/consent-equal-choice", async () => {
  const links = [fakeLink("Alle akzeptieren", null, "banner"), fakeLink("Ich möchte nicht sparen", null, "banner")];
  assert.equal((await runFake(here, { links })).status, "pass");
  const english = await runFake(here, { links: [fakeLink("No thanks, I don't like discounts")] }, {}, { languages: ["en"] });
  assert.equal(english.status, "warn");
});

// Evidence gap: pop-ups come from scripts.
test("gives info instead of no finding when a page did not load with JavaScript", async () => {
  const result = await runFake(here, {}, { pages: [fakePage("https://example.de/"), failedJsPage("https://example.de/shop", { text: "Shop" })] });
  assert.equal(result.status, "info");
  assert.match(result.message, /did not load with JavaScript/);
});

test("skips when no page of the site loaded", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
