import { test } from "node:test";
import assert from "node:assert/strict";
import { availableLanguages, resolveLanguages } from "./lang.ts";
import { loadYaml } from "./data.ts";
import { messageKeys } from "./messages.ts";
import { normalize } from "./text.ts";

const keys = (code: string) => {
  const pack = loadYaml<{ links: object; text: object }>(`lang/${code}.yml`);
  return { links: Object.keys(pack.links).sort(), text: Object.keys(pack.text).sort(), messages: messageKeys(code).sort() };
};

test("every language defines the same concepts", () => {
  const [first, ...rest] = availableLanguages();
  for (const code of rest) assert.deepEqual(keys(code), keys(first), `lang/${code}.yml differs from lang/${first}.yml`);
});

test("all selects every language", () => {
  assert.deepEqual(resolveLanguages("all"), availableLanguages());
  assert.throws(() => resolveLanguages("xx"), /Unknown language/);
});

test("normalize folds umlauts, case and spaces", () => {
  assert.equal(normalize("  Verträge   HIER kündigen "), "vertraege hier kuendigen");
  assert.equal(normalize("Datenschutz­erklärung"), "datenschutzerklaerung");
});
