import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeLink, runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sales = true;

test("passes with VAT, shipping, base price and the 30-day lowest price", async () => {
  const result = await runCheck(here, "complete", { sales });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, []);
});

test("warns for every missing notice, also for a price struck through with CSS", async () => {
  const result = await runCheck(here, "incomplete", { sales });
  assert.equal(result.status, "warn");
  assert.equal(result.details.length, 4);
  assert.ok(result.details.some((d) => d.includes("750 ml")));
  assert.ok(result.details.some((d) => d.includes("14,99 €")));
});

test("does not ask for the 30-day price next to a recommended retail price", async () => {
  const result = await runCheck(here, "rrp", { sales });
  assert.equal(result.status, "pass");
  assert.match(result.details.join("\n"), /recommended retail price/);
});

test("skips without prices next to a cart; the imprint's share capital does not count", async () => {
  assert.equal((await runCheck(here, "none", { sales })).status, "skip");
});

const cart = fakeLink("In den Warenkorb");

test("a shipping link next to other links counts, also when it points to the start page", async () => {
  const links = [cart, fakeLink("Versandkosten", "https://example.de/#versand")];
  const result = await runFake(here, { text: "Kaffee 9,99 € inkl. MwSt.", links }, {}, { sales: true });
  assert.equal(result.status, "pass");
});

test("reads euro signs before the amount and a base price as 1 kg = …", async () => {
  const text = "Kaffee 750 g € 9,99 (1 kg = 13,32 €) inkl. MwSt. zzgl. Versand";
  const result = await runFake(here, { text, links: [cart] }, {}, { sales: true });
  assert.equal(result.status, "pass");
});

test("names the first struck-through price", async () => {
  const result = await runFake(here, { text: "Kaffee 9,99 € inkl. MwSt. zzgl. Versand", links: [cart], struck: ["19,99 €", "29,99 €"] }, {}, { sales: true });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].params?.price, "19,99 €");
});
