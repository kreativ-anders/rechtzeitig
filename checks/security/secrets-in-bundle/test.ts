import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

// Built at runtime so the repository itself contains no secret-looking strings.
const stripe = ["sk", "live", "Zq7Lm2Xv9Rt4Kp8Wn3Yb6Hd1"].join("_");
const jwt = (payload: object) => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature1234567"].join(".");
const page = '<html lang="de"><body><h1>Shop</h1><script src="/app.js"></script></body></html>';
const env = ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");

test("passes when the served scripts hold only public keys", async () => {
  const ctx = await siteFromFiles({ "index.html": page, "app.js": `createClient("https://abc.supabase.co", "${jwt({ role: "anon" })}");` });
  const result = await runCrossCheck(here, ctx, { "src/app.ts": "x" });
  assert.equal(result.status, "pass");
  assert.match(result.message, /No secrets in the 2 HTML and script files/);
});

test("fails for a service_role key in the bundle and names the public variable in the repository", async () => {
  const ctx = await siteFromFiles({ "index.html": page, "app.js": `createClient(url, "${jwt({ role: "service_role" })}");` });
  const result = await runCrossCheck(here, ctx, { "src/db.ts": `const key = process.env.${env};\n` });
  assert.equal(result.status, "fail");
  assert.match(result.details[0], /^Supabase service_role key in \/app\.js \(eyJh… \(\d+ chars\)\)$/);
  assert.equal(result.details[1], `src/db.ts:1: ${env} is read with a public prefix, so the build puts its value into the browser bundle.`);
  // Never the secret itself.
  assert.ok(!JSON.stringify(result.raw).includes("signature1234567"));
});

test("fails for a live Stripe key inline in the HTML, without a variable to blame", async () => {
  const ctx = await siteFromFiles({ "index.html": `<html><body><script>window.KEY="${stripe}"</script>Hello</body></html>` });
  const result = await runCrossCheck(here, ctx, { "README.md": "x" });
  assert.equal(result.status, "fail");
  assert.match(result.details[0], /^Stripe secret key in \/ \(sk_l… \(32 chars\)\)$/);
  assert.match(result.details[1], /No public-prefixed secret variable/);
});

test("gives info instead of a pass when files were not kept", async () => {
  const ctx = await siteFromFiles({ "index.html": page, "app.js": "console.log(1)" });
  const result = await runCrossCheck(here, { ...ctx, codeSkipped: 3 }, { "a.txt": "x" });
  assert.equal(result.status, "info");
});

test("skips when nothing of the site could be read", async () => {
  const ctx = await siteFromFiles({ "index.html": page });
  assert.equal((await runCrossCheck(here, { ...ctx, code: [] }, { "a.txt": "x" })).status, "skip");
});
