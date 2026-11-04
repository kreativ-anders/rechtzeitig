import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for a settings link in the footer", async () => {
  const result = await runCheck(here, "footer");
  assert.equal(result.status, "pass");
  assert.match(result.message, /Cookie-Einstellungen/);
});

test("passes for a floating icon named by aria-label", async () => {
  assert.equal((await runCheck(here, "icon", { language: "en" })).status, "pass");
});

test("gives info when the link is only in the privacy policy", async () => {
  const result = await runCheck(here, "privacy-only");
  assert.equal(result.status, "info");
  assert.match(result.message, /\/datenschutz/);
});

test("gives info when the settings button sits only in the banner", async () => {
  assert.equal((await runCheck(here, "banner-only")).status, "info");
});

test("warns when no way back to the settings is found", async () => {
  assert.equal((await runCheck(here, "missing")).status, "warn");
});

test("skips without a banner", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
