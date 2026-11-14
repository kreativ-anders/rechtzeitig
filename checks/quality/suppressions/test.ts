import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const config = (yaml: string) => ({ "README.md": "# app", ".github/rechtzeitig.yml": yaml });

test("passes without a file: nothing is turned off", async () => {
  const result = await runRepoCheck(here, { "README.md": "# app" });
  assert.equal(result.status, "pass");
  assert.equal(result.raw.details, undefined);
});

test("passes for valid entries and lists each one", async () => {
  const result = await runRepoCheck(here, config(`suppress:
  - rule: A11Y-ALT-001
    category: not-applicable
    reason: "Kleinstunternehmen, das BFSG gilt nicht (§ 3 Abs. 3 BFSG)"
  - rule: SEC-HDR-001
    category: accepted-risk
    reason: "CSP is rolled out with the next frontend release"
    expires: ${day(30)}
`));
  assert.equal(result.status, "pass");
  assert.deepEqual(result.raw.details?.map((d) => [d.line, d.key]), [[2, "entry"], [5, "entry_until"]]);
});

test("fails for an entry without reason, an expired date and an unknown rule, with the line of each", async () => {
  const result = await runRepoCheck(here, config(`suppress:
  - rule: A11Y-ALT-001
    category: not-applicable
  - rule: SEC-HDR-001
    category: accepted-risk
    reason: "CSP is rolled out with the next frontend release"
    expires: ${day(-1)}
  - rule: NOPE-X-001
    category: false-positive
    reason: "The rule matches our generated vendor bundle"
`));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.line, d.key]), [[2, "missing_reason"], [7, "expired"], [8, "unknown_rule"]]);
});

test("fails for a file that is not valid YAML", async () => {
  const result = await runRepoCheck(here, config("suppress:\n  - rule: [A11Y-ALT-001\n"));
  assert.equal(result.status, "fail");
  assert.equal(result.raw.details?.[0].key, "unreadable");
});
