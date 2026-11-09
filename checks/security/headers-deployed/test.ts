import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const page = "<html><body>Hello</body></html>";
const live = (headers: Record<string, string>) => siteFromFiles({ "index.html": page, "_headers.json": JSON.stringify(headers) });
const vercel = JSON.stringify({
  headers: [
    { source: "/(.*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Cache-Control", value: "no-store" }] },
    { source: "/api/(.*)", headers: [{ key: "Permissions-Policy", value: "camera=()" }] },
  ],
}, null, 2);

test("passes when the site sends every security header the repository sets", async () => {
  const site = await live({ "x-frame-options": "DENY", "x-content-type-options": "nosniff" });
  const result = await runCrossCheck(here, site, { "vercel.json": vercel });
  assert.equal(result.status, "pass");
  assert.equal(result.message, "All 2 security headers from the repository are sent on /.");
});

test("warns for a header the repository sets but the site does not send", async () => {
  const site = await live({ "x-content-type-options": "nosniff" });
  const result = await runCrossCheck(here, site, { "vercel.json": vercel });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["vercel.json:7: X-Frame-Options is set here, but the site does not send it."]);
});

test("gives info for another value", async () => {
  const site = await live({ "x-frame-options": "SAMEORIGIN", "x-content-type-options": "nosniff" });
  assert.equal((await runCrossCheck(here, site, { "vercel.json": vercel })).status, "info");
});

test("reads netlify.toml with a multi-line CSP and _headers", async () => {
  const toml = '[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = """\n      default-src \'self\';\n      img-src \'self\'\n    """\n    Referrer-Policy = "no-referrer"\n';
  const site = await live({ "content-security-policy": "default-src 'self'; img-src 'self'" });
  const result = await runCrossCheck(here, site, { "netlify.toml": toml, "public/_headers": "/*\n  Cross-Origin-Opener-Policy: same-origin\n/admin/*\n  X-Frame-Options: DENY\n" });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, [
    "netlify.toml:8: Referrer-Policy is set here, but the site does not send it.",
    "public/_headers:2: Cross-Origin-Opener-Policy is set here, but the site does not send it.",
  ]);
});

test("reads firebase.json and .htaccess outside scoped blocks", async () => {
  const firebase = JSON.stringify({ hosting: { headers: [{ source: "**", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }] } });
  const htaccess = '<IfModule mod_headers.c>\n  Header always set Referrer-Policy "strict-origin"\n</IfModule>\n<FilesMatch "\\.pdf$">\n  Header set X-Frame-Options "DENY"\n</FilesMatch>\n';
  const site = await live({ "x-content-type-options": "nosniff", "referrer-policy": "strict-origin" });
  assert.equal((await runCrossCheck(here, site, { "firebase.json": firebase, "public/.htaccess": htaccess })).status, "pass");
});

test("skips without a hosting config that sets security headers", async () => {
  const site = await live({});
  assert.equal((await runCrossCheck(here, site, { "vercel.json": '{"headers":[{"source":"/(.*)","headers":[{"key":"Cache-Control","value":"x"}]}]}' })).status, "skip");
});
