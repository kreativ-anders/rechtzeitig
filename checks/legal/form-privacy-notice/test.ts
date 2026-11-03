import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when the form links the privacy policy", async () => {
  assert.equal((await runCheck(here, "with-notice")).status, "pass");
});

test("warns for a contact form without a notice", async () => {
  const result = await runCheck(here, "without-notice");
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /^\/: form with text:name, email:email, textarea:message, sends to formspree\.io$/);
});

test("ignores login forms", async () => {
  assert.equal((await runCheck(here, "login")).status, "skip");
});

test("a form without a usable action still gets a result", async () => {
  const form = (action: string) => ({ action, fields: ["email:email"], personal: true, links: [], text: "Newsletter" });
  const result = await runFake(here, { forms: [form(""), form("javascript:void(0)"), form("http://[bad")] });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["/: form with email:email", "/: form with email:email", "/: form with email:email"]);
});
