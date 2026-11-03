import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const cookie = (name: string, flags: Partial<{ secure: boolean; httpOnly: boolean; sameSite: string }> = {}) =>
  ({ name, domain: "example.de", secure: true, httpOnly: true, sameSite: "Lax", ...flags });

test("passes for secure session cookies", async () => {
  assert.equal((await runFake(here, { cookies: [cookie("session")] })).status, "pass");
});

test("warns for a session cookie without Secure and HttpOnly", async () => {
  const result = await runFake(here, { cookies: [cookie("PHPSESSID", { secure: false, httpOnly: false })] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["PHPSESSID: missing Secure, HttpOnly"]);
});

test("allows CSRF cookies to be read by scripts", async () => {
  assert.equal((await runFake(here, { cookies: [cookie("XSRF-TOKEN", { httpOnly: false })] })).status, "pass");
});

test("names a missing Secure only once, also with SameSite=None", async () => {
  const result = await runFake(here, { cookies: [cookie("prefs", { secure: false, sameSite: "None" })] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["prefs: missing Secure (required with SameSite=None)"]);
});

test("cookies of other sites are info, not a warning for the site", async () => {
  const result = await runFake(here, { cookies: [{ ...cookie("sid", { secure: false, httpOnly: false }), domain: "ads.example-ads.com" }] });
  assert.equal(result.status, "info");
  assert.match(result.details?.[0] ?? "", /^sid: missing Secure, HttpOnly \(set by another site/);
});

test("skips without cookies", async () => {
  assert.equal((await runFake(here, {})).status, "skip");
});
