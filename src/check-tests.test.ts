// Every rule's test.ts expects a pass and something else, and every status its check.ts can return.
// A rule tested only on sites that pass, or only on sites that fail, would also pass its tests when broken.

import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { STATUSES } from "./sdk.ts";

const ROOT = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

for (const file of globSync("checks/*/*/check.ts", { cwd: ROOT.pathname }).sort()) {
  const dir = file.slice(0, -"check.ts".length);
  test(`${dir}test.ts covers pass, another status and every status check.ts returns`, () => {
    const check = read(file);
    const tests = read(`${dir}test.ts`);
    const expects = (status: string) => tests.includes(`"${status}"`);
    assert.ok(expects("pass"), "no test expects pass");
    assert.ok(STATUSES.some((s) => s !== "pass" && expects(s)), "no test expects a status other than pass");
    const returned = STATUSES.filter((s) => new RegExp(`\\b${s}\\(`).test(check));
    assert.deepEqual(returned.filter((s) => !expects(s)), [], "statuses check.ts returns that no test expects");
    // Each test asserts something; "it did not throw" is no test of a rule.
    const empty = tests.split(/\n(?=[ \t]*test\()/).slice(1).filter((t) => !/\bassert\b/.test(t));
    assert.deepEqual(empty.map((t) => t.split("\n")[0].trim()), [], "tests without an assertion");
  });
}
