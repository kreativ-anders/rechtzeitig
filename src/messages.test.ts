import { test } from "node:test";
import assert from "node:assert/strict";
import { render, renderFinding } from "./messages.ts";
import { loadRegistry } from "./registry.ts";

test("a localized parameter, like a vendor's advice, follows the report language", () => {
  const advice = loadRegistry().vendor("fonts.googleapis.com")?.advice;
  assert.ok(advice);
  const finding = { key: "service_advice", params: { name: "Google Fonts", hosts: "fonts.googleapis.com", pages: "/", advice } };
  assert.match(renderFinding(finding, "privacy/third-parties-before-consent", "de"), /Schriften selbst hosten/);
  assert.match(renderFinding(finding, "privacy/third-parties-before-consent", "en"), /Host the fonts yourself/);
});

test("a missing key names the language file and the key", () => {
  assert.throws(() => render({ key: "nope" }, "security/secrets", "de"), /lang\/de\.yml: messages\.security\/secrets\.nope is missing/);
});
