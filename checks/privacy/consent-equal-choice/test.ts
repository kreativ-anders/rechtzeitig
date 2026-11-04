import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";
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
