import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const npm = { "package-lock.json": npmLock({ a: "1.0.0" }) };
const composer = { "composer.lock": JSON.stringify({ packages: [{ name: "x/y", version: "1.0.0" }] }) };
const dependabot = (...ecosystems: string[]) => ({
  ".github/dependabot.yml": `version: 2\nupdates:\n${ecosystems.map((e) => `  - package-ecosystem: ${e}\n    directory: /\n`).join("")}`,
});

test("passes when Dependabot covers every ecosystem", async () => {
  assert.equal((await runRepoCheck(here, { ...npm, ...dependabot("npm") })).status, "pass");
});

test("warns when Dependabot misses an ecosystem", async () => {
  const result = await runRepoCheck(here, { ...npm, ...composer, ...dependabot("npm") });
  assert.equal(result.status, "warn");
  assert.match(result.message, /composer/);
});

test("passes with Renovate", async () => {
  assert.equal((await runRepoCheck(here, { ...npm, "renovate.json": "{}" })).status, "pass");
});

test("notes a scanner without update pull requests", async () => {
  const workflow = { ".github/workflows/ci.yml": "steps:\n  - run: npm audit --omit=dev\n" };
  assert.equal((await runRepoCheck(here, { ...npm, ...workflow })).status, "info");
});

test("counts a renovate key in package.json, not a renovate dependency", async () => {
  assert.equal((await runRepoCheck(here, { ...npm, "package.json": '{"renovate":{"extends":["config:base"]}}' })).status, "pass");
  assert.equal((await runRepoCheck(here, { ...npm, "package.json": '{"devDependencies":{"renovate":"^37.0.0"}}' })).status, "warn");
});

test("warns when nothing watches the dependencies", async () => {
  assert.equal((await runRepoCheck(here, npm)).status, "warn");
});

test("skips without dependencies", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("names the Dependabot ecosystem to add", async () => {
  const result = await runRepoCheck(here, { ...npm, ...composer, ...dependabot("npm") });
  assert.deepEqual(result.raw.details?.map((d) => d.params?.name), ["composer"]);
});

// Every name in data/update-tools.yml covers its ecosystem.
const LOCKS: Record<string, Record<string, string>> = {
  npm,
  composer,
  pub: { "pubspec.lock": 'packages:\n  http:\n    dependency: "direct main"\n    source: hosted\n    version: "1.2.0"\n' },
  cargo: { "Cargo.lock": '[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n' },
  pypi: { "requirements.txt": "requests==2.31.0\n" },
  go: { "go.mod": "module x\n\nrequire github.com/a/b v1.2.3\n" },
};
const NAMES: Array<[string, string]> = [["npm", "npm"], ["npm", "bun"], ["composer", "composer"], ["pub", "pub"], ["cargo", "cargo"],
  ["pypi", "pip"], ["pypi", "uv"], ["pypi", "pipenv"], ["pypi", "poetry"], ["go", "gomod"]];
test("each Dependabot name covers its ecosystem", async () => {
  for (const [ecosystem, name] of NAMES) {
    assert.equal((await runRepoCheck(here, { ...LOCKS[ecosystem], ...dependabot(name) })).status, "pass", name);
  }
});
