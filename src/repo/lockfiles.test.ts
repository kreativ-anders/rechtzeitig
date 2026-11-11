import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCKFILES, parserFor, purl } from "./lockfiles.ts";

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

const yarn = (text: string) => LOCKFILES["yarn.lock"](text).map((c) => purl(c));

test("yarn classic: plain and scoped entries keep their name", () => {
  const lock = ["# yarn lockfile v1", "", "lodash@^4.17.0, lodash@^4.17.20:", '  version "4.17.21"', "", '"@babel/core@^7.0.0":', '  version "7.24.0"', ""].join("\n");
  assert.deepEqual(yarn(lock), ["pkg:npm/lodash@4.17.21", "pkg:npm/%40babel/core@7.24.0"]);
});

test("yarn classic: an alias names the package it points to", () => {
  const lock = [
    '"alias@npm:lodash@4.17.20":',
    '  version "4.17.20"',
    '  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.20.tgz"',
    "",
    '"x@npm:@scope/pkg@1.0.0":',
    '  version "1.0.0"',
    "",
    '"short@npm:left-pad":',
    '  version "1.3.0"',
    "",
  ].join("\n");
  assert.deepEqual(yarn(lock), ["pkg:npm/lodash@4.17.20", "pkg:npm/%40scope/pkg@1.0.0", "pkg:npm/left-pad@1.3.0"]);
});

test("yarn classic: several descriptors on one entry, the alias first or not", () => {
  const lock = ['lodash@^4.17.20, "alias@npm:lodash@^4.17.0":', '  version "4.17.21"', "", '"alias@npm:lodash@^4.17.0", lodash@^4.17.20:', '  version "4.17.21"', ""].join("\n");
  assert.deepEqual(yarn(lock), ["pkg:npm/lodash@4.17.21", "pkg:npm/lodash@4.17.21"]);
});

test("yarn berry: the resolution names the package, also for aliases", () => {
  const lock = [
    "__metadata:",
    "  version: 8",
    "  cacheKey: 10c0",
    "",
    '"alias@npm:lodash@4.17.20":',
    "  version: 4.17.20",
    '  resolution: "lodash@npm:4.17.20"',
    "  languageName: node",
    "",
    '"x@npm:@scope/pkg@^1.0.0, @scope/pkg@npm:^1.0.0":',
    "  version: 1.0.0",
    '  resolution: "@scope/pkg@npm:1.0.0"',
    "",
    '"react@npm:^18.0.0":',
    "  version: 18.2.0",
    '  resolution: "react@npm:18.2.0"',
    "",
    '"app@workspace:.":',
    "  version: 0.0.0-use.local",
    '  resolution: "app@workspace:."',
    "",
  ].join("\n");
  assert.deepEqual(yarn(lock), ["pkg:npm/lodash@4.17.20", "pkg:npm/%40scope/pkg@1.0.0", "pkg:npm/react@18.2.0"]);
});

test("yarn: non-registry references keep the name before their protocol", () => {
  const classic = ['"local@file:../local":', '  version "1.0.0"', "", '"dep@https://github.com/org/dep.git#abc":', '  version "2.0.0"', '  resolved "https://github.com/org/dep.git#abc"', ""].join("\n");
  assert.deepEqual(yarn(classic), ["pkg:npm/local@1.0.0", "pkg:npm/dep@2.0.0"]);
  const berry = [
    '"local@link:../local::locator=app%40workspace%3A.":',
    "  version: 0.0.0-use.local",
    '  resolution: "local@link:../local::locator=app%40workspace%3A."',
    "",
    '"dep@git+https://github.com/org/dep.git#commit=abc":',
    "  version: 2.0.0",
    '  resolution: "dep@git+https://github.com/org/dep.git#commit=abc"',
    "",
  ].join("\n");
  assert.deepEqual(yarn(berry), ["pkg:npm/dep@2.0.0"]);
});
