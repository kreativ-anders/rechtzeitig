import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runFake } from "../../../test/helpers.ts";
import type { Link } from "../../../src/sdk.ts";

const here = import.meta.dirname;

const button = (text: string, style: Partial<NonNullable<Link["style"]>> = {}): Link => ({
  href: null, text, label: text.toLowerCase(), area: "banner", button: true,
  style: { width: 200, height: 44, fontSize: 16, color: "rgb(255, 255, 255)", background: "rgb(26, 79, 160)", ...style },
});

test("passes when reject looks like accept", async () => {
  const result = await runCheck(here, "equal");
  assert.equal(result.status, "pass");
  assert.equal(result.message, "\"Alle akzeptieren\" and \"Alle ablehnen\" are of similar size and readability.");
});

test("warns for a small, pale reject link next to a big accept button", async () => {
  const result = await runCheck(here, "hidden-reject");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["smaller", "smaller_font", "low_contrast"]);
});

test("warns for a refusal worded as a loss, even without a plain reject button", async () => {
  const result = await runCheck(here, "shaming");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["\"Nein, ich möchte keine besseren Angebote\": the refusal is worded to make users feel bad."]);
});

test("a plain no is not shaming", async () => {
  const links = [button("Alle akzeptieren"), button("Nein, ich möchte keine Cookies"), button("Ablehnen")];
  assert.equal((await runFake(here, { links })).status, "pass");
});

test("warns for low contrast alone, with semi-transparent text", async () => {
  const links = [button("Akzeptieren"), button("Ablehnen", { color: "rgba(26, 79, 160, 0.2)", background: "rgb(255, 255, 255)" })];
  const result = await runFake(here, { links });
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /^"Ablehnen" has a contrast of 1\.\d:1, "Akzeptieren" 7\.\d:1\.$/);
});

test("skips without a banner, and without a reject button", async () => {
  assert.equal((await runFake(here, {})).status, "skip");
  const result = await runFake(here, { links: [button("Alle akzeptieren")] });
  assert.equal(result.status, "skip");
  assert.match(result.message, /privacy\/consent-reject/);
});

const choice = (accept: Partial<NonNullable<Link["style"]>>, reject: Partial<NonNullable<Link["style"]>>) =>
  runFake(here, { links: [button("Alle akzeptieren", accept), button("Alle ablehnen", reject)] });
const keys = async (accept: Partial<NonNullable<Link["style"]>>, reject: Partial<NonNullable<Link["style"]>>) =>
  (await choice(accept, reject)).raw.details?.map((d) => d.key) ?? [];

test("reject is smaller below half the area of accept", async () => {
  const result = await choice({ width: 200, height: 40 }, { width: 98, height: 40 });
  assert.equal(result.raw.details?.[0].params?.percent, 49);
  assert.deepEqual(await keys({ width: 200, height: 40 }, { width: 100, height: 40 }), []);
  assert.deepEqual(await keys({ width: 200, height: 40 }, { width: 49, height: 40 }), ["smaller"]);
});

test("reject text is smaller below 80 percent of the accept text", async () => {
  assert.deepEqual(await keys({ fontSize: 20 }, { fontSize: 15.9 }), ["smaller_font"]);
  assert.deepEqual(await keys({ fontSize: 20 }, { fontSize: 16 }), []);
});

test("low contrast: accept readable (4.5) and reject below 3", async () => {
  const white = { background: "rgb(255, 255, 255)" };
  const black = { ...white, color: "rgb(0, 0, 0)" };
  assert.deepEqual(await keys(black, { ...white, color: "rgb(150, 150, 150)" }), ["low_contrast"]);
  assert.deepEqual(await keys(black, { ...white, color: "rgb(148, 148, 148)" }), []);
  assert.deepEqual(await keys(black, { ...white, color: "rgb(200, 200, 200)" }), ["low_contrast"]);
  // Accept itself at about 3:1 is not readable enough to compare.
  assert.deepEqual(await keys({ ...white, color: "rgb(150, 150, 150)" }, { ...white, color: "rgb(220, 220, 220)" }), []);
});

test("reads alpha in percent and skips colors it cannot read", async () => {
  const white = { background: "rgb(255, 255, 255)" };
  const black = { ...white, color: "rgb(0, 0, 0)" };
  assert.deepEqual(await keys(black, { ...white, color: "rgba(0, 0, 0, 30%)" }), ["low_contrast"]);
  assert.deepEqual(await keys(black, { ...white, color: "rgba(0, 0, 0, 90%)" }), []);
  assert.deepEqual(await keys(black, { ...white, color: "oklch(0.9 0 0)" }), []);
  assert.deepEqual(await keys(black, { color: "rgb(220, 220, 220)", background: "color(srgb 1 1 1)" }), []);
});

test("compares the largest visible buttons, ignoring ones without size or style", async () => {
  const hidden = button("Akzeptieren", { width: 0, height: 0 });
  const plain: Link = { ...button("Zustimmen"), style: undefined };
  const result = await runFake(here, { links: [hidden, plain, button("Alle akzeptieren"), button("Alle ablehnen")] });
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.params?.accept, "Alle akzeptieren");
});

// Audit 2026-11-10: a reject button the visitor cannot see or use is never "equal".
for (const fixture of ["reject-display-none", "reject-visibility-hidden", "reject-hidden-ancestor", "reject-disabled"]) {
  test(`does not pass when the only reject button is not usable (${fixture})`, async () => {
    assert.notEqual((await runCheck(here, fixture)).status, "pass");
  });
}

test("passes for a visible reject button of the same size", async () => {
  assert.equal((await runCheck(here, "reject-visible")).status, "pass");
});

test("does not pass when the buttons have no rendered size", async () => {
  const banner = [fakeLink("Alle akzeptieren", null, "banner"), fakeLink("Alle ablehnen", null, "banner")];
  assert.equal((await runFake(here, { links: banner })).status, "skip");
});
