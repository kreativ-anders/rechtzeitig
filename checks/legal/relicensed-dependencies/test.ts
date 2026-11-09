import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const run = (name: string, version: string, dev = false) => runRepoCheck(here, { "package-lock.json": npmLock({ [name]: { version, dev }, base: "1.0.0" }) });

test("passes before the license change and for other packages", async () => {
  assert.equal((await run("mapbox-gl", "1.13.3")).status, "pass");
  assert.equal((await run("maplibre-gl", "4.0.0")).status, "pass");
});

test("warns from the first version under the new license, with the fork", async () => {
  const result = await run("mapbox-gl", "2.0.0");
  assert.equal(result.status, "warn");
  assert.match(result.details[0], /^package-lock\.json: mapbox-gl@2\.0\.0: LicenseRef-Mapbox-Terms-of-Service since 2\.0\.0, before BSD-3-Clause\. Open fork: maplibre-gl\./);
  assert.equal((await run("directus", "10.13.1")).status, "warn");
});

test("reads Go modules and ignores dev dependencies", async () => {
  const go = (v: string) => runRepoCheck(here, { "go.mod": `module x\n\nrequire github.com/hashicorp/terraform ${v}\n` });
  assert.equal((await go("v1.5.7")).status, "pass");
  assert.equal((await go("v1.6.0")).status, "warn");
  assert.equal((await run("mapbox-gl", "3.0.0", true)).status, "pass");
});

test("skips without dependencies", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "hi" })).status, "skip");
});
