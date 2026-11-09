import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const run = (license: string, dev = false) =>
  runRepoCheck(here, { "package.json": '{"license":"MIT"}', "package-lock.json": npmLock({ lib: { version: "1.0.0", license, dev }, base: { version: "1.0.0", license: "MIT" } }) });

test("passes for open source licenses, Boost BSL-1.0 included", async () => {
  for (const license of ["MIT", "BSL-1.0", "GPL-3.0-only", "Elastic-2.0 OR AGPL-3.0-only"]) assert.equal((await run(license)).status, "pass", license);
});

test("warns for source-available licenses with what they forbid", async () => {
  const cases: Array<[string, RegExp]> = [
    ["BUSL-1.1", /Additional Use Grant/],
    ["SSPL-1.0", /whole service stack/],
    ["Elastic-2.0", /managed service/],
    ["FSL-1.1-MIT", /competing use/],
    ["PolyForm-Noncommercial-1.0.0", /PolyForm/],
    ["Apache-2.0 WITH Commons-Clause", /no selling/],
    ["CC-BY-NC-4.0", /No commercial use/],
    ["Elastic-2.0 OR SSPL-1.0", /managed service/],
  ];
  for (const [license, says] of cases) {
    const result = await run(license);
    assert.equal(result.status, "warn", license);
    assert.match(result.details[0], says, license);
  }
});

test("accepts dev dependencies", async () => {
  assert.equal((await run("BUSL-1.1", true)).status, "pass");
});

// Ported from the former legal/licenses test: every restricted pattern in data/licenses.yml is reached.
test("warns for proprietary and commercial dependencies", async () => {
  for (const license of ["proprietary", "LicenseRef-commercial"]) assert.equal((await run(license)).status, "warn", license);
});
