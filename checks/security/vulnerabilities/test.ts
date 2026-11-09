import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const files = {
  "package-lock.json": npmLock({ lodash: "4.17.20", vite: { version: "5.0.0", dev: true } }),
};
const vuln = (purl: string, severity: string) => ({ id: "GHSA-test", purl, summary: "Prototype pollution", severity, fixed: "4.17.21" });

test("passes without known vulnerabilities", async () => {
  assert.equal((await runRepoCheck(here, files, { osv: "ok" })).status, "pass");
});

test("fails for a high severity issue in production", async () => {
  const result = await runRepoCheck(here, files, { osv: "ok", vulnerabilities: [vuln("pkg:npm/lodash@4.17.20", "HIGH")] });
  assert.equal(result.status, "fail");
  assert.equal(result.details?.[0], "package-lock.json: lodash@4.17.20: GHSA-test HIGH. Prototype pollution Fixed in 4.17.21.");
});

test("only warns when the issue is in a dev dependency", async () => {
  const result = await runRepoCheck(here, files, { osv: "ok", vulnerabilities: [vuln("pkg:npm/vite@5.0.0", "HIGH")] });
  assert.equal(result.status, "warn");
});

test("keeps issues without details and says that details are missing", async () => {
  const bare = { id: "GHSA-bare", purl: "pkg:npm/lodash@4.17.20", summary: "", severity: "" };
  const result = await runRepoCheck(here, files, { osv: "ok (details for 0 of 1)", vulnerabilities: [bare] });
  assert.equal(result.status, "warn");
  assert.match(result.message, /OSV sent details for 0 of 1 issue;/);
  assert.deepEqual(result.details, ["package-lock.json: lodash@4.17.20: GHSA-bare."]);
});

test("skips without dependencies", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("warns when OSV could not be asked", async () => {
  const result = await runRepoCheck(here, files, { osv: "error: timeout" });
  assert.equal(result.status, "warn");
  assert.match(result.message, /timeout/);
});
