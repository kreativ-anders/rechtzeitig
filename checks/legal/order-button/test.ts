import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with the wording from the law on the checkout page", async () => {
  const result = await runCheck(here, "good", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.details.join("\n"), /\/kasse/);
});

test("fails for \"Bestellen\" on the checkout page", async () => {
  assert.equal((await runCheck(here, "wrong", { sales })).status, "fail");
});

test("warns for \"Weiter\" on the checkout page, which may be an earlier step", async () => {
  assert.equal((await runCheck(here, "generic", { sales })).status, "warn");
});

test("warns for \"Bestellung absenden\" in an order form outside a checkout", async () => {
  assert.equal((await runCheck(here, "form", { sales })).status, "warn");
});

test("skips without a checkout: a product button and a contact form do not count", async () => {
  assert.equal((await runCheck(here, "none", { sales })).status, "skip");
});

const checkout = "Zahlungsart: Vorkasse. Gesamtsumme: 49,99 €";

test("gives info when the checkout button is not recognized", async () => {
  const result = await runSite(here, { "/kasse": { text: checkout, links: [fakeLink("Los geht's")] } }, {}, { sales: true });
  assert.equal(result.status, "info");
});

test("a page needs both a payment method and a total to count as checkout", async () => {
  const result = await runSite(here, { "/kasse": { text: "Zahlungsart: Vorkasse", links: [fakeLink("Bestellen")] } }, {}, { sales: true });
  assert.equal(result.status, "skip");
});

test("only buttons count, not a link with the right words", async () => {
  const links = [fakeLink("Zahlungspflichtig bestellen", "https://example.de/hilfe"), fakeLink("Bestellen")];
  const result = await runSite(here, { "/kasse": { text: checkout, links } }, {}, { sales: true });
  assert.equal(result.status, "fail");
});

test("an order form needs an address field, not just any field", async () => {
  const form = (fields: string[]) => ({ action: "", fields, personal: true, links: [fakeLink("Bestellung absenden")], text: "" });
  const at = (fields: string[]) => runSite(here, { "/bestellen": { forms: [form(fields)] } }, {}, { sales: true });
  assert.equal((await at(["email:email", "text:strasse"])).status, "warn");
  assert.equal((await at(["email:email"])).status, "skip");
});
