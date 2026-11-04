import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const file = (url: string, integrity = false) => ({ url, type: "script" as const, integrity });

test("passes when other sites' files carry a hash, and names the tag manager as excluded", async () => {
  const result = await runCheck(here, "signed");
  assert.equal(result.status, "pass");
  assert.deepEqual(result.raw.details?.map((d) => d.params?.host), ["www.googletagmanager.com"]);
});

test("warns for scripts and stylesheets from other sites without integrity, as written in the HTML", async () => {
  const result = await runCheck(here, "unsigned");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => `${d.key} ${d.params?.url}`).sort(), [
    "script https://cdn.example.com/lib.js",
    "script https://unpkg.com/some-lib@1.0.0/dist/lib.min.js",
    "stylesheet https://cdn.example.com/lib.css",
  ]);
});

test("passes without files from other sites, and counts subdomains of the site as its own", async () => {
  const subresources = [file("https://example.de/app.js"), file("https://static.example.de/app.js")];
  assert.equal((await runFake(here, { subresources })).status, "pass");
});

test("leaves out services whose files change, with their subdomains", async () => {
  const subresources = [file("https://js.stripe.com/v3/"), file("https://consent.cookiebot.com/uc.js")];
  const result = await runFake(here, { subresources });
  assert.equal(result.status, "pass");
  assert.equal(result.details.length, 2);
});

test("skips when no page of the site loaded", async () => {
  assert.equal((await runFake(here, { status: 0 })).status, "skip");
});
