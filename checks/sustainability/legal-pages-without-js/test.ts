import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runFake, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for plain HTML", async () => {
  assert.equal((await runCheck(here, "static")).status, "pass");
});

test("fails when the links are added by JavaScript", async () => {
  const result = await runCheck(here, "js-links");
  assert.equal(result.status, "fail");
  assert.equal(result.details?.length, 2);
});

test("fails when the imprint text is rendered by JavaScript", async () => {
  const result = await runCheck(here, "js-content");
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /^Imprint: .* shows no text/);
});

test("reads the imprint page that loaded, not a broken first link", async () => {
  const result = await runCheck(here, "broken-first");
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /^Imprint: \/impressum shows no text/);
});

test("skips when the start page links no legal page", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("a button with the same name next to the link does not hide the link", async () => {
  const links = [fakeLink("Impressum"), fakeLink("Impressum", "https://example.de/impressum", "footer")];
  const result = await runSite(here, { "/": { links }, "/impressum": { text: "Angaben gemäß § 5 DDG. Muster GmbH, Musterstraße 1, 12345 Berlin. Telefon 030 1234567, E-Mail info@example.de. Vertreten durch die Geschäftsführung." } });
  assert.equal(result.status, "pass");
});
