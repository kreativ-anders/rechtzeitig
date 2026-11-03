import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const files = {
  "package-lock.json": JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" }, "node_modules/vite": { version: "5.0.0", dev: true } } }),
};
const vuln = (purl: string, severity: string) => ({ id: "GHSA-test", purl, summary: "Prototype pollution", severity, fixed: "4.17.21" });

test("passes without known vulnerabilities", async () => {
  assert.equal((await runRepoCheck(here, files, { osv: "ok" })).status, "pass");
});

test("fails for a high severity issue in production", async () => {
  const result = await runRepoCheck(here, files, { osv: "ok", vulnerabilities: [vuln("pkg:npm/lodash@4.17.20", "HIGH")] });
  assert.equal(result.status, "fail");
  assert.equal(result.details?.[0], "lodash@4.17.20: GHSA-test HIGH. Prototype pollution Fixed in 4.17.21.");
});

test("only warns when the issue is in a dev dependency", async () => {
  const result = await runRepoCheck(here, files, { osv: "ok", vulnerabilities: [vuln("pkg:npm/vite@5.0.0", "HIGH")] });
  assert.equal(result.status, "warn");
});
