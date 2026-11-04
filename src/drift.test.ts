import { test } from "node:test";
import assert from "node:assert/strict";
import { problems, type Commit } from "./drift.ts";

const commit = (files: string[], message = "✨ Change something", langScopes: string[] = []): Commit => ({ sha: "abc", message, files, langScopes });

test("a changed check.ts needs its rule.yml in the same commit", () => {
  assert.deepEqual(problems(commit(["checks/security/headers/check.ts"])), [
    "checks/security/headers/check.ts changed, checks/security/headers/rule.yml not",
  ]);
  assert.deepEqual(problems(commit(["checks/security/headers/check.ts", "checks/security/headers/rule.yml"])), []);
});

test("changed messages of a rule need its rule.yml", () => {
  assert.deepEqual(problems(commit(["lang/en.yml"], "m", ["sustainability/cache-headers"])), [
    "messages of sustainability/cache-headers in lang/ changed, checks/sustainability/cache-headers/rule.yml not",
  ]);
  assert.deepEqual(problems(commit(["lang/en.yml", "checks/sustainability/cache-headers/rule.yml"], "m", ["sustainability/cache-headers"])), []);
});

test("a changed data file is named in the commit message", () => {
  assert.deepEqual(problems(commit(["data/third-parties.yml"])), ["data/third-parties.yml changed, the commit message does not name third-parties.yml"]);
  assert.deepEqual(problems(commit(["data/third-parties.yml"], "✨ Add Plausible to third-parties.yml")), []);
});

test("Docs-unchanged with a reason accepts the commit, without a reason it does not", () => {
  const files = ["checks/security/headers/check.ts", "data/leaks.yml"];
  assert.deepEqual(problems(commit(files, "♻️ Refactor\n\nDocs-unchanged: results do not change\nCo-Authored-By: x")), []);
  assert.equal(problems(commit(files, "♻️ Refactor\n\nDocs-unchanged:")).length, 2);
});

test("tests, fixtures and other files need nothing", () => {
  assert.deepEqual(problems(commit(["checks/security/headers/test.ts", "checks/security/headers/fixtures/a/index.html", "src/report.ts"])), []);
});
