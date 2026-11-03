import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

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
