import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

const cookie = (name: string, flags: Partial<{ secure: boolean; httpOnly: boolean; sameSite: string }> = {}) =>
  ({ name, domain: "example.de", secure: true, httpOnly: true, sameSite: "Lax", ...flags });

test("passes for secure session cookies", async () => {
  assert.equal((await run({ cookies: [cookie("session")] })).status, "pass");
});

test("warns for a session cookie without Secure and HttpOnly", async () => {
  const result = await run({ cookies: [cookie("PHPSESSID", { secure: false, httpOnly: false })] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["PHPSESSID: missing Secure, HttpOnly"]);
});

test("allows CSRF cookies to be read by scripts", async () => {
  assert.equal((await run({ cookies: [cookie("XSRF-TOKEN", { httpOnly: false })] })).status, "pass");
});

test("skips without cookies", async () => {
  assert.equal((await run({})).status, "skip");
});
