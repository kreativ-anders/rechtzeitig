import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runSite } from "../../../test/helpers.ts";

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

// Start page linking an imprint with the given text.
const imprint = (text: string) =>
  runSite(here, { "/": { links: [fakeLink("Impressum", "https://example.de/impressum", "footer")] }, "/impressum": { text: `Impressum. ${text}` } });
const BASE = "Muster GmbH, Musterstraße 1, 12345 Berlin. E-Mail: info@example.de.";

test("reads an e-mail address in capitals", async () => {
  assert.equal((await imprint("Muster GmbH, Musterstraße 1, 12345 Berlin. INFO@EXAMPLE.DE, Telefon 030 1234567")).status, "pass");
});

test("reads phone numbers with 00 and + country codes", async () => {
  assert.equal((await imprint(`${BASE} Telefon 0049 30 1234567`)).status, "pass");
  assert.equal((await imprint(`${BASE} Telefon +49 30 1234567`)).status, "pass");
});

test("every register type counts, and its number is no postcode", async () => {
  for (const register of ["HRB", "HRA", "VR", "PR", "GnR", "GsR"]) {
    const result = await imprint(`Muster e.V., Amtsgericht Berlin, ${register} 12345 Berlin. E-Mail: info@example.de, Telefon 030 1234567`);
    assert.equal(result.status, "warn", register);
    assert.deepEqual(result.raw.details?.map((d) => d.key), ["no_address", "no_vat_id", "register"], register);
  }
});
