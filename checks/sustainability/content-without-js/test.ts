import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext, fakePage, rendered, runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for plain HTML", async () => {
  assert.equal((await runCheck(here, "static")).status, "pass");
});

test("warns for a single page app that renders everything in the browser", async () => {
  assert.equal((await runCheck(here, "spa")).status, "warn");
});

// Start page with the given text with JavaScript off and on.
async function shares(noJs: string, js: string) {
  const page = fakePage("https://example.de/", { text: js });
  const start = { ...page, noJs: { ...page.noJs, text: noJs } };
  const { default: check } = await import("./check.ts");
  return rendered(here, await check.run(fakeContext(start.js, { start, pages: [start] }))).status;
}

test("warns below 20 percent of the text without JavaScript", async () => {
  assert.equal(await shares("a".repeat(19), "a".repeat(100)), "warn");
  assert.equal(await shares("a".repeat(30), "a".repeat(100)), "pass");
  assert.equal(await shares("", "a"), "warn");
  assert.equal(await shares("", ""), "pass");
});
