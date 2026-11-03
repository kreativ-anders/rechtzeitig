import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes with address, email and phone", async () => {
  const result = await runCheck(here, "complete");
  assert.equal(result.status, "pass");
  assert.ok(result.details?.includes("VAT ID (USt-IdNr.) found."));
});

test("accepts an obfuscated email address", async () => {
  assert.equal((await runCheck(here, "obfuscated")).status, "pass");
});

test("fails without an email address", async () => {
  assert.equal((await runCheck(here, "no-email")).status, "fail");
});

test("warns when address and phone are missing", async () => {
  const result = await runCheck(here, "email-only");
  assert.equal(result.status, "warn");
  assert.match(result.message, /2 item/);
});

test("does not take a register number for a postcode or an IBAN for a phone number", async () => {
  const result = await runCheck(here, "register-iban");
  assert.equal(result.status, "warn");
  assert.match(result.message, /2 item/);
  assert.ok(result.details?.includes("Register entry found."));
});

test("skips when there is no imprint", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
