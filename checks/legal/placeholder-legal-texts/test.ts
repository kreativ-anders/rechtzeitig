import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const start = '<html lang="de"><body><main>Willkommen</main><footer><a href="/impressum">Impressum</a> <a href="/datenschutz">Datenschutz</a></footer></body></html>';
const policy = "<html><body><h1>Datenschutzerklärung</h1><p>Verantwortlich ist die Beispiel GmbH. Rechtsgrundlage Art. 6 DSGVO.</p></body></html>";
const site = (imprint: string) => siteFromFiles({ "index.html": start, "impressum.html": imprint, "datenschutz.html": policy });
const real = "<html><body><h1>Impressum</h1><p>Erika Schmidt</p><p>Lindenstraße 4</p><p>10115 Berlin</p><p>kontakt@schmidt-web.de</p></body></html>";
const template = "<html><body><h1>Impressum</h1><p>Max Mustermann</p><p>Musterstraße 1</p><p>12345 Musterstadt</p><p>Telefon: +49 123 456789</p></body></html>";

test("fails for template data on the live imprint, with the repository line it comes from", async () => {
  const result = await runCrossCheck(here, await site(template), {
    "src/pages/impressum.astro": "<h1>Impressum</h1>\n<p>Max Mustermann</p>\n<p>Musterstraße 1</p>",
    "src/components/Hero.tsx": "export const Hero = () => <h1>Hallo</h1>;",
  });
  assert.equal(result.status, "fail");
  assert.match(result.details.join("\n"), /imprint \(Impressum\) at \/impressum: "Max Mustermann"/);
  assert.match(result.details.join("\n"), /src\/pages\/impressum\.astro:2: The live text comes from here: max mustermann/);
  assert.match(result.details.join("\n"), /src\/pages\/impressum\.astro:3: The live text comes from here: musterstrasse/);
});

test("fails and says when no repository file holds the live text", async () => {
  const result = await runCrossCheck(here, await site(template), { "README.md": "Site" });
  assert.equal(result.status, "fail");
  assert.match(result.details.join("\n"), /comes from a CMS/);
});

test("gives info for template data only in the repository's legal files", async () => {
  const result = await runCrossCheck(here, await site(real), {
    "content/datenschutz.md": "# Datenschutz\n\nVerantwortlich: [Firmenname], max@example.com",
    "src/lib/patterns.ts": "const demo = 'Max Mustermann';",
  });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["content/datenschutz.md:3: Template data in a legal text: [firmenname], @example.com. Not on the live pages."]);
});

test("passes for real details, ignoring code and data files that name placeholders", async () => {
  const result = await runCrossCheck(here, await site(real), {
    "src/pages/impressum.astro": "<p>Erika Schmidt</p>",
    "config/patterns.yml": "demo: Max Mustermann",
    "src/privacy/demo.ts": "// Max Mustermann",
  });
  assert.equal(result.status, "pass");
});

test("skips without legal pages", async () => {
  const result = await runCrossCheck(here, await siteFromFiles({ "index.html": "<html><body>Hallo</body></html>" }), { "README.md": "x" });
  assert.equal(result.status, "skip");
});
