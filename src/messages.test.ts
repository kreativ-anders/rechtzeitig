import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { render, renderFinding } from "./messages.ts";
import { loadRegistry } from "./registry.ts";
import { loadYaml } from "./data.ts";

test("a vendor's advice is a parameter like any other", () => {
  const advice = loadRegistry().vendor("fonts.googleapis.com")?.advice;
  assert.ok(advice);
  const finding = { key: "service_advice", params: { name: "Google Fonts", hosts: "fonts.googleapis.com", pages: "/", advice } };
  assert.match(renderFinding(finding, "privacy/third-parties-before-consent"), /Host the fonts yourself/);
});

test("a missing key names the file and the key", () => {
  assert.throws(() => render({ key: "nope" }, "security/secrets"), /lang\/en\.yml: messages\.security\/secrets\.nope is missing/);
});

test("only lang/en.yml has messages: reports are English, other languages only add detection patterns", () => {
  const withMessages = readdirSync(new URL("../lang/", import.meta.url))
    .filter((f) => f.endsWith(".yml") && "messages" in loadYaml<object>(`lang/${f}`));
  assert.deepEqual(withMessages, ["en.yml"]);
});
