import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runFake } from "../../../test/helpers.ts";

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

const personal = (links: ReturnType<typeof fakeLink>[], text: string, fields = ["email:email"]) => ({ action: "", fields, personal: true, links, text });

test("a link to the privacy policy or a mention of it in the form is enough", async () => {
  const link = fakeLink("Datenschutz", "https://example.de/datenschutz");
  assert.equal((await runFake(here, { forms: [personal([link], "Newsletter")] })).status, "pass");
  assert.equal((await runFake(here, { forms: [personal([], "Hinweise in der Datenschutzerklärung")] })).status, "pass");
});

test("a sign-up form with a password and more fields is no login form", async () => {
  const result = await runFake(here, { forms: [personal([], "Konto anlegen", ["email:email", "password:password", "text:name"])] });
  assert.equal(result.status, "warn");
});
