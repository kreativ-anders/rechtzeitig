import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const workflow = (steps: string) => `on: push\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;

test("warns for continue-on-error on tests, || true and a test script that does nothing", async () => {
  const result = await runRepoCheck(here, {
    ".github/workflows/ci.yml": workflow("      - uses: actions/checkout@v4\n      - name: Test\n        run: npm test\n        continue-on-error: true\n      - name: Lint\n        run: npx eslint . || true\n"),
    "package.json": '{ "scripts": { "test": "echo \\"no tests yet\\"", "lint": "eslint ." } }',
  });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["continue_on_error", "or_true", "noop_test_script"]);
});

test("warns when many files turn type checks off", async () => {
  const files = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`src/f${i}.ts`, "// @ts-nocheck\nexport const x = 1;"]));
  const result = await runRepoCheck(here, { ...files, "src/ok.ts": "export const y = 2;" });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.details?.[0].key, "suppressed_files");
});

test("passes for failing checks, harmless optional steps and single suppressions", async () => {
  const result = await runRepoCheck(here, {
    ".github/workflows/ci.yml": workflow("      - run: npm test\n      - name: Upload coverage\n        uses: codecov/codecov-action@v4\n        continue-on-error: true\n      - name: Test optional\n        run: npm test\n        continue-on-error: false\n"),
    "package.json": '{ "scripts": { "test": "echo \\"Error: no test specified\\" && exit 1" } }',
    "scripts/clean.sh": "rm -rf dist || true\ntest -f .env || true",
    "src/legacy.ts": "// @ts-nocheck\nexport const z = 3;",
  });
  assert.equal(result.status, "pass");
});

test("skips a repository without code files", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "# Notes", "docs/guide.md": "Text" })).status, "skip");
});
