import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes without cookies", async () => {
  assert.equal((await runCheck(here, "clean")).status, "pass");
});

test("fails for a Google Analytics cookie", async () => {
  const result = await runCheck(here, "tracking");
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /^_ga .*Google Analytics/);
});

test("lists own cookies and storage for review", async () => {
  const result = await runCheck(here, "own");
  assert.equal(result.status, "info");
  assert.deepEqual(result.details?.map((d) => d.split(" ")[0]), ["session", "localStorage:"]);
});

const cookie = (name: string, domain: string) => ({ name, domain, secure: true, httpOnly: false, sameSite: "Lax", expires: -1 });

test("warns for a cookie of another site that is no known tracker", async () => {
  const result = await runFake(here, { cookies: [cookie("uid", "widget.example.com")] });
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 1);
});

test("a tracking cookie on the own domain is listed once, as tracking", async () => {
  const result = await runFake(here, { cookies: [cookie("_ga", "example.de")] });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["tracking_cookie"]);
});
