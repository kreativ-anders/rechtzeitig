import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const start = '<html lang="de"><body><main>Hallo</main><footer><a href="/datenschutz">Datenschutz</a></footer></body></html>';
const site = (policy: string, headers: Record<string, string>) =>
  siteFromFiles({ "index.html": start, "datenschutz.html": `<html><body><h1>Datenschutzerklärung</h1><p>${policy}</p></body></html>`, "_headers.json": JSON.stringify(headers) });
const vercel = { "vercel.json": '{"cleanUrls": true}' };

test("warns when deploy file and live header agree but the policy does not name the host", async () => {
  const result = await runCrossCheck(here, await site("Wir nutzen keine Dienste.", { "x-vercel-id": "fra1::abc" }), vercel);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["vercel.json:1: Deploys to Vercel (US), live header x-vercel-id: not named in the privacy policy."]);
});

test("passes when the policy names the host and third-country transfers", async () => {
  const result = await runCrossCheck(here, await site("Hosting bei Vercel Inc., USA, auf Grundlage des Data Privacy Framework.", { "x-vercel-id": "fra1::abc" }), vercel);
  assert.equal(result.status, "pass");
});

test("gives info when the host is named but third countries are not", async () => {
  const result = await runCrossCheck(here, await site("Hosting bei Netlify.", { "x-nf-request-id": "01H" }), { "netlify.toml": "[build]\n  publish = \"dist\"\n" });
  assert.equal(result.status, "info");
});

test("skips when only one side shows the provider", async () => {
  const policy = "Wir nutzen keine Dienste.";
  assert.equal((await runCrossCheck(here, await site(policy, {}), vercel)).status, "skip");
  assert.equal((await runCrossCheck(here, await site(policy, { "x-vercel-id": "x" }), { "README.md": "x" })).status, "skip");
});

test("reads generic files only with their marker: CNAME with a domain, app.yaml with a runtime", async () => {
  const policy = "Wir nutzen keine Dienste.";
  const gh = await site(policy, { "x-github-request-id": "1", server: "GitHub.com" });
  assert.equal((await runCrossCheck(here, gh, { "docs/CNAME": "example.de\n" })).status, "warn");
  const gcp = await site(policy, { server: "Google Frontend" });
  assert.equal((await runCrossCheck(here, gcp, { "app.yaml": "env: prod\n" })).status, "skip");
  assert.equal((await runCrossCheck(here, gcp, { "app.yaml": "runtime: nodejs22\n" })).status, "warn");
});
