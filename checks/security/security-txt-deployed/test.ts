import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const txt = (contact: string, expires = "2099-01-01T00:00:00Z") => `Contact: ${contact}\nExpires: ${expires}\n`;
const site = (body?: string) => siteFromFiles({ "index.html": "<html><body>Hi</body></html>", ...(body && { ".well-known/security.txt": body }) });
const repo = { "public/.well-known/security.txt": txt("mailto:security@example.de") };

test("passes when the site serves the repository's security.txt", async () => {
  const result = await runCrossCheck(here, await site(txt("mailto:security@example.de")), repo);
  assert.equal(result.status, "pass");
});

test("warns when the repository has one and the site serves none", async () => {
  const result = await runCrossCheck(here, await site(), repo);
  assert.equal(result.status, "warn");
  assert.match(result.message, /does not serve one .*HTTP 404/);
});

test("warns when the live copy expired but the repository's is current", async () => {
  const result = await runCrossCheck(here, await site(txt("mailto:security@example.de", "2020-01-01T00:00:00Z")), repo);
  assert.equal(result.status, "warn");
  assert.match(result.message, /expired on 2020-01-01/);
});

test("warns when the contacts differ", async () => {
  const result = await runCrossCheck(here, await site(txt("mailto:old@example.de")), repo);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["public/.well-known/security.txt: Only in the repository: mailto:security@example.de", "Only on the site: mailto:old@example.de"]);
});

test("skips without a security.txt in the repository; fixtures do not count", async () => {
  assert.equal((await runCrossCheck(here, await site(), { "test/fixtures/.well-known/security.txt": txt("x") })).status, "skip");
});

test("gives info when the repository's security.txt has no fields it can read", async () => {
  const result = await runCrossCheck(here, await site(txt("mailto:security@example.de")), { "public/.well-known/security.txt": "nothing here\n" });
  assert.equal(result.status, "info");
});
