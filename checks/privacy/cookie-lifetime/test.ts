import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const inDays = (days: number) => Math.round(Date.now() / 1000 + days * 86400);
const cookie = (name: string, expires: number, domain = "example.de") =>
  ({ name, domain, secure: true, httpOnly: false, sameSite: "Lax", expires });

test("passes for a Matomo-like cookie of 13 months and session cookies", async () => {
  const result = await runFake(here, { cookies: [cookie("_pk_id.1", inDays(393)), cookie("session", -1)] });
  assert.equal(result.status, "pass");
});

test("warns for a Google Analytics cookie of two years (capped by Chrome at 400 days)", async () => {
  const result = await runFake(here, { cookies: [cookie("_ga", inDays(400))] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["_ga (example.de, set on /): tracking cookie of Google Analytics, expires in 400 days"]);
});

test("warns for a two-year _ga cookie set by a script in Chromium", async () => {
  const result = await runCheck(here, "ga");
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /^_ga .*Google Analytics, expires in (39[89]|400) days$/);
});

test("warns for a long-lived cookie of another site", async () => {
  const result = await runFake(here, { cookies: [cookie("uid", inDays(400), ".ads.example-ads.com"), cookie("prefs", inDays(400))] });
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 2);
});

test("long-lived own cookies only give info", async () => {
  const result = await runFake(here, { cookies: [cookie("prefs", inDays(400))] });
  assert.equal(result.status, "info");
});

test("skips without cookies", async () => {
  assert.equal((await runFake(here, {})).status, "skip");
});
