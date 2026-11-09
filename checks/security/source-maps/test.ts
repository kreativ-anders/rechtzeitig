import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck, siteFromFiles } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const page = '<html lang="de"><body><h1>Shop</h1><script src="/app.js"></script></body></html>';
const map = (content: boolean) => JSON.stringify({
  version: 3,
  sources: ["webpack://shop/./src/lib/db.ts", "webpack://shop/./node_modules/react/index.js", "index.ts"],
  ...(content && { sourcesContent: ["export const db = 1;", "", ""] }),
  mappings: "",
});
const repo = { "src/lib/db.ts": "export const db = 1;", "index.ts": "x" };

test("warns when a public source map carries the code of repository files", async () => {
  const site = await siteFromFiles({ "index.html": page, "app.js": "console.log(1);\n//# sourceMappingURL=app.js.map", "app.js.map": map(true) });
  const result = await runCrossCheck(here, site, repo);
  assert.equal(result.status, "warn");
  assert.equal(result.message, "Public source maps (1) carry the source code of 1 repository file.");
  assert.match(result.details[0], /\/app\.js\.map$/);
  assert.equal(result.details[1], "src/lib/db.ts");
});

test("finds a monorepo file by its path ending and reads inline maps", async () => {
  const inline = Buffer.from(map(false)).toString("base64");
  const site = await siteFromFiles({ "index.html": page, "app.js": `console.log(1);\n//# sourceMappingURL=data:application/json;base64,${inline}` });
  const result = await runCrossCheck(here, site, { "apps/web/src/lib/db.ts": "x" });
  assert.equal(result.status, "warn");
  assert.match(result.message, /name 1 repository file/);
});

test("gives info for a public map whose paths are not in the repository", async () => {
  const site = await siteFromFiles({ "index.html": page, "app.js": "x;\n//# sourceMappingURL=app.js.map", "app.js.map": map(true) });
  assert.equal((await runCrossCheck(here, site, { "other/file.ts": "x" })).status, "info");
});

test("passes when the map is not served", async () => {
  const site = await siteFromFiles({ "index.html": page, "app.js": "x;\n//# sourceMappingURL=app.js.map" });
  assert.equal((await runCrossCheck(here, site, repo)).status, "pass");
});

test("skips a site without scripts of its own", async () => {
  const site = await siteFromFiles({ "index.html": "<html><body>Hello</body></html>" });
  assert.equal((await runCrossCheck(here, site, repo)).status, "skip");
});
