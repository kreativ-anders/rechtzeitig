import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const start = (form = "") => `<html lang="de"><body><main>${form}</main><footer><a href="/datenschutz">Datenschutz</a></footer></body></html>`;
const site = (policy: string, form = "") =>
  siteFromFiles({ "index.html": start(form), "datenschutz.html": `<html><body><h1>Datenschutzerklärung</h1><p>${policy}</p></body></html>` });
const contact = { "src/pages/kontakt.astro": '<h1>Kontakt</h1>\n<form action="https://formspree.io/f/xyzabcd" method="POST">\n<input name="email" type="email"></form>' };

test("warns for a form backend in the code that the privacy policy does not name", async () => {
  const result = await runCrossCheck(here, await site("Wir verarbeiten Ihre Anfrage selbst."), contact);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["src/pages/kontakt.astro:2: Sends a form to Formspree."]);
});

test("gives info when the receiver is named but third countries are not, and passes with both", async () => {
  assert.equal((await runCrossCheck(here, await site("Formulare laufen über Formspree."), contact)).status, "info");
  assert.equal((await runCrossCheck(here, await site("Formspree Inc., USA, Standardvertragsklauseln."), contact)).status, "pass");
});

test("reads Netlify form attributes and live forms whose host the repository names", async () => {
  const netlify = await runCrossCheck(here, await site("Nichts."), { "index.html": '<form name="contact" method="POST" data-netlify="true">' });
  assert.equal(netlify.status, "warn");
  assert.match(netlify.message, /Netlify Forms/);
  const form = '<form action="https://hooks.mailer-example.de/in" method="post"><input name="email" type="email"><button>Senden</button></form>';
  const live = await runCrossCheck(here, await site("Nichts.", form), { "src/config.json": '{"endpoint": "https://hooks.mailer-example.de/in"}' });
  assert.equal(live.status, "warn");
  assert.deepEqual(live.details, ["src/config.json:1: A form on / sends to hooks.mailer-example.de, named here."]);
});

test("skips without a form receiver, also for a live form only the website shows", async () => {
  const form = '<form action="https://hooks.mailer-example.de/in" method="post"><input name="email" type="email"></form>';
  assert.equal((await runCrossCheck(here, await site("Nichts.", form), { "README.md": "formspree.io/f/abc" })).status, "skip");
});

test("does not take bare hosts or package names in lists for a form, but an import", async () => {
  const files = { "renovate.json": '{"packageRules":[{"matchPackageNames":["@emailjs/browser","@typeform/embed"]}]}', "config/hosts.yml": "hosts: [hsforms.com, formspree.io]" };
  assert.equal((await runCrossCheck(here, await site("Nichts."), files)).status, "skip");
  const sdk = { "src/contact.ts": 'import emailjs from "@emailjs/browser";' };
  assert.equal((await runCrossCheck(here, await site("Nichts."), sdk)).status, "warn");
});
