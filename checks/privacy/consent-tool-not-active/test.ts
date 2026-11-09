import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const tracker = '<script src="https://connect.facebook.net/en_US/fbevents.js"></script>';
const banner = '<div class="cookie-banner" role="dialog"><button>Alle akzeptieren</button><button>Ablehnen</button></div>';
const page = (head: string, body = "Hallo") => siteFromFiles({ "index.html": `<html lang="de"><head>${head}</head><body>${body}</body></html>` });
const cookiebot = { "src/layout.html": '<head>\n<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="x"></script>\n</head>' };
const library = { "package.json": '{"dependencies":{"vanilla-cookieconsent":"3.0.1"}}' };

test("fails when the repository loads a consent platform the site never contacted while trackers load", async () => {
  const result = await runCrossCheck(here, await page(tracker), cookiebot);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.details, ["src/layout.html:2: Loads a consent platform here.", "Meta Pixel loads on /."]);
});

test("warns for an installed library without a banner", async () => {
  const result = await runCrossCheck(here, await page(tracker), library);
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /package\.json:1: vanilla-cookieconsent is installed here/);
});

test("passes when the banner shows, or nothing needs consent", async () => {
  assert.equal((await runCrossCheck(here, await page(tracker, banner), library)).status, "pass");
  assert.equal((await runCrossCheck(here, await page(""), cookiebot)).status, "pass");
});

test("skips without a consent tool in the repository", async () => {
  assert.equal((await runCrossCheck(here, await page(tracker), { "README.md": "cookiebot is great" })).status, "skip");
});
