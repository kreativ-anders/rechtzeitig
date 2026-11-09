import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const fixture = (path: string) => readFileSync(join(here, "fixtures", "hollow", path), "utf8");

test("warns for tautologies, swallowed failures, tests without assertions and passWithNoTests", async () => {
  const result = await runRepoCheck(here, {
    // Hollow test files live in fixtures/ (.txt, so tsc leaves them alone), like every other fixture.
    "src/math.test.ts": fixture("src/math.test.ts.txt"),
    "src/api.test.ts": fixture("src/api.test.ts.txt"),
    "src/ui.spec.tsx": "test('renders', () => {\n  render(<App />);\n});",
    "tests/test_app.py": "def test_ok():\n    assert True\n",
    "package.json": '{ "scripts": { "test": "jest --passWithNoTests" } }',
  });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key).sort(), ["no_assertions", "pass_with_no_tests", "swallowed", "tautology", "tautology"]);
});

test("warns for focused tests and many skipped tests", async () => {
  const skipped = Array.from({ length: 4 }, (_, i) => `it.skip('case ${i}', () => { expect(f()).toBe(${i}); });`).join("\n");
  const result = await runRepoCheck(here, { "src/a.test.js": `${skipped}\nit.only('real', () => { expect(f()).toBe(1); });` });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["focused", "skipped_share"]);
});

test("passes for real assertions in every language", async () => {
  const result = await runRepoCheck(here, {
    "src/math.test.ts": "it('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});\nafterEach(() => { try { cleanup(); } catch {} });",
    "tests/test_app.py": "def test_add():\n    assert add(1, 2) == 3\n",
    "math_test.go": "func TestAdd(t *testing.T) {\n\tif add(1, 2) != 3 {\n\t\tt.Errorf(\"wrong\")\n\t}\n}",
    "package.json": '{ "scripts": { "test": "jest" } }',
  });
  assert.equal(result.status, "pass");
});

test("skips without tests", async () => {
  assert.equal((await runRepoCheck(here, { "src/index.ts": "export {}" })).status, "skip");
});
