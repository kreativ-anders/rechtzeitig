import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";
import { satisfies } from "../../../src/sdk.ts";

const here = import.meta.dirname;
const pkg = (deps: Record<string, string>, extra: Record<string, unknown> = {}) => JSON.stringify({ name: "app", dependencies: deps, ...extra }, null, 2);

test("semver ranges as npm and Cargo read them", () => {
  const cases: Array<[string, string, "npm" | "cargo", boolean | undefined]> = [
    ["1.2.3", "^1.0.0", "npm", true],
    ["2.0.0", "^1.0.0", "npm", false],
    ["0.2.5", "^0.2.3", "npm", true],
    ["0.3.0", "^0.2.3", "npm", false],
    ["1.2.9", "~1.2.3", "npm", true],
    ["1.3.0", "~1.2.3", "npm", false],
    ["1.5.0", ">=1.2 <2", "npm", true],
    ["3.1.0", "^1.0.0 || ^3.0.0", "npm", true],
    ["1.4.0", "1.x", "npm", true],
    ["1.4.0", "1.2.0 - 1.3", "npm", false],
    ["1.0.0", "latest", "npm", undefined],
    ["1.0.0", "workspace:*", "npm", undefined],
    ["1.40.2", "1.40", "cargo", true],
    ["2.0.0", "1", "cargo", false],
    ["1.0.5", ">=1.0, <1.1", "cargo", true],
    ["1.0.0", "=1.0.1", "cargo", false],
  ];
  for (const [v, r, f, want] of cases) assert.equal(satisfies(v, r, f), want, `${v} ${r} ${f}`);
});

test("skips without lockfiles or manifests", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("passes when the lockfile meets the manifest", async () => {
  const files = { "package.json": pkg({ react: "^18.2.0", next: "latest" }), "package-lock.json": npmLock({ react: "18.3.1", next: "15.0.0" }) };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("warns on lockfiles of two package managers in one folder", async () => {
  const files = { "package.json": pkg({}), "package-lock.json": npmLock({}), "yarn.lock": "# yarn lockfile v1\n" };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.params?.managers]), [["managers", "npm, yarn"]]);
});

test("compares no versions when an unread lockfile of another manager lies next to it", async () => {
  const files = { "package.json": pkg({ react: "^19.0.0" }), "package-lock.json": npmLock({ react: "18.3.1" }), "bun.lockb": "\u0000bin" };
  const result = await runRepoCheck(here, files);
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["managers"]);
});

test("warns when packageManager names another manager than the lockfile", async () => {
  const files = { "package.json": pkg({}, { packageManager: "pnpm@9.12.0" }), "package-lock.json": npmLock({}) };
  const result = await runRepoCheck(here, files);
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.params?.manager]), [["package_manager", "pnpm"]]);
});

test("warns on a range no locked version meets in package-lock.json", async () => {
  const files = { "package.json": pkg({ react: "^19.0.0" }), "package-lock.json": npmLock({ react: "18.3.1" }) };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line, d.params?.locked]), [["stale", 4, "18.3.1"]]);
});

test("compares the specifier pnpm recorded", async () => {
  const lock = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react:\n        specifier: ^18.2.0\n        version: 18.3.1\npackages:\n  react@18.3.1:\n    resolution: {integrity: sha512-x}\n";
  const ok = await runRepoCheck(here, { "package.json": pkg({ react: "^18.2.0" }), "pnpm-lock.yaml": lock });
  assert.equal(ok.status, "pass");
  const stale = await runRepoCheck(here, { "package.json": pkg({ react: "^18.3.0" }), "pnpm-lock.yaml": lock });
  assert.equal(stale.raw.details?.[0].key, "stale");
});

test("compares yarn.lock descriptors, classic and berry", async () => {
  const classic = '# yarn lockfile v1\n\nreact@^18.2.0:\n  version "18.3.1"\n';
  assert.equal((await runRepoCheck(here, { "package.json": pkg({ react: "^18.2.0" }), "yarn.lock": classic })).status, "pass");
  const berry = '__metadata:\n  version: 8\n\n"react@npm:^18.2.0":\n  version: 18.3.1\n';
  assert.equal((await runRepoCheck(here, { "package.json": pkg({ react: "^18.2.0" }), "yarn.lock": berry })).status, "pass");
  assert.equal((await runRepoCheck(here, { "package.json": pkg({ react: "^18.3.0" }), "yarn.lock": berry })).status, "warn");
});

test("reads Cargo requirements with Cargo's caret default", async () => {
  const lock = 'version = 3\n\n[[package]]\nname = "serde"\nversion = "1.0.210"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n';
  const ok = await runRepoCheck(here, { "Cargo.toml": '[package]\nname = "a"\n[dependencies]\nserde = "1.0"\n', "Cargo.lock": lock });
  assert.equal(ok.status, "pass");
  const stale = await runRepoCheck(here, { "Cargo.toml": '[package]\nname = "a"\n[dependencies]\nserde = "2"\n', "Cargo.lock": lock });
  assert.equal(stale.status, "warn");
});
