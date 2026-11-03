import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCKFILES, parserFor } from "./lockfiles.ts";

const pnpm = (text: string) => LOCKFILES["pnpm-lock.yaml"](text).map((c) => `${c.name}@${c.version}${c.dev ? " dev" : ""}`);

test("pnpm v5: reads /name/version keys and the dev flag", () => {
  const lock = "lockfileVersion: 5.4\npackages:\n  /a/1.0.0:\n    dev: false\n  /@s/b/2.0.0_react@18.0.0:\n    dev: true\n";
  assert.deepEqual(pnpm(lock), ["a@1.0.0", "@s/b@2.0.0 dev"]);
});

test("pnpm v6: reads /name@version keys and the dev flag", () => {
  const lock = "lockfileVersion: '6.0'\npackages:\n  /a@1.0.0:\n    dev: false\n  /@s/b@2.0.0(react@18.0.0):\n    dev: true\n";
  assert.deepEqual(pnpm(lock), ["a@1.0.0", "@s/b@2.0.0 dev"]);
});

test("pnpm v9: dev is what production dependencies do not reach", () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "importers:",
    "  .:",
    "    dependencies:",
    "      a: { specifier: ^1, version: 1.0.0 }",
    "    devDependencies:",
    "      d: { specifier: ^1, version: 1.0.0(a@1.0.0) }",
    "packages:",
    "  a@1.0.0: {}",
    "  '@s/b@2.0.0': {}",
    "  d@1.0.0: {}",
    "  e@1.0.0: {}",
    "snapshots:",
    "  a@1.0.0:",
    "    dependencies:",
    "      '@s/b': 2.0.0",
    "  '@s/b@2.0.0': {}",
    "  d@1.0.0(a@1.0.0):",
    "    dependencies:",
    "      e: 1.0.0",
    "  e@1.0.0: {}",
  ].join("\n");
  assert.deepEqual(pnpm(lock), ["a@1.0.0", "@s/b@2.0.0", "d@1.0.0 dev", "e@1.0.0 dev"]);
});

test("parserFor maps requirements*.txt and ignores unknown names", () => {
  assert.equal(parserFor("api/requirements-dev.txt"), parserFor("requirements.txt"));
  assert.equal(parserFor("web/package-lock.json"), LOCKFILES["package-lock.json"]);
  assert.equal(parserFor("constructor"), undefined);
  assert.equal(parserFor("README.md"), undefined);
});
