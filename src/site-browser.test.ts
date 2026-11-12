import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadChecks, moduleOf, scopeOf } from "./runner.ts";
import { serve, testBrowser } from "../test/helpers.ts";

const DOCS = fileURLToPath(new URL("../docs/", import.meta.url));

const browser = testBrowser();
after(async () => (await browser).close());

// Issue #48: the interactive parts of docs/ (search, filters, keyboard expansion) have no regression test.
// One real Chromium against the static docs/, with every request to another host blocked.
test("checks.html: scope hash, search, empty state and keyboard expansion work in a real browser", async () => {
  const checks = await loadChecks();
  const total = checks.length;
  const both = checks.filter((c) => scopeOf(c.check) === "both").length;
  const privacy = checks.filter((c) => moduleOf(c.id) === "privacy").length;

  const site = await serve(DOCS);
  const context = await (await browser).newContext();
  const external: string[] = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).hostname === "127.0.0.1") return route.continue();
    external.push(url); // e.g. Pirsch (api.pirsch.io): blocked, the page must still work
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // A blocked external resource logs "Failed to load resource"; that is the block working, not a page error.
    if (m.type() === "error" && !(m.text().includes("Failed to load resource") && m.location().url && !m.location().url!.startsWith(site.url))) {
      errors.push(m.text());
    }
  });
  try {
    const visible = () => page.locator(".rule:not([hidden])").count();

    await page.goto(`${site.url}checks.html#both`, { waitUntil: "load" });
    await page.locator("#toolbar").waitFor(); // hidden until checks.js has run
    assert.equal(await visible(), both, "only the cards of scope both are visible");
    assert.match(await page.locator('#scopes .chip[aria-pressed="true"]').textContent() ?? "", /Repository \+ website/);

    // Search without matches: empty state, no cards.
    await page.fill("#q", "zzzz-no-match");
    assert.equal(await visible(), 0);
    assert.ok(await page.locator("#empty").isVisible(), "the empty state shows");

    // Clear the search and the scope filter: all cards again.
    await page.fill("#q", "");
    assert.equal(await visible(), both, "the scope filter is still active");
    await page.locator('#scopes .chip', { hasText: "All" }).click();
    assert.equal(await visible(), total);
    assert.ok(await page.locator("#empty").isHidden(), "the empty state is hidden again");

    // Keyboard: Enter on the first card's summary expands it.
    const first = page.locator(".rule").first();
    await first.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.notEqual(await first.getAttribute("open"), null, "the card opened with the keyboard");

    // Group hash: only the privacy module's cards, its chip active.
    await page.goto(`${site.url}checks.html#privacy`, { waitUntil: "load" });
    await page.locator("#toolbar").waitFor();
    assert.equal(await visible(), privacy);
    assert.match(await page.locator('#modules .chip[aria-pressed="true"]').textContent() ?? "", /Privacy/);

    assert.deepEqual(errors, [], "no page or console errors (CSP violations included)");
    assert.ok(external.every((u) => new URL(u).hostname !== "127.0.0.1"), "no request the page needs was blocked");
  } finally {
    await context.close();
    site.close();
  }
});
