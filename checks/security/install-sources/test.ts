import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const sha = "0123456789abcdef0123456789abcdef01234567";
const npm = (packages: Record<string, Record<string, unknown>>) =>
  JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "app" }, ...packages } }, null, 2);
const tgz = (host: string, name: string) => `${host}/${name}/-/${name}-1.0.0.tgz`;
const keys = (r: Awaited<ReturnType<typeof runRepoCheck>>) => r.raw.details?.map((d) => d.key);

test("skips without lockfiles, manifests or package configs", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("no finding for HTTPS downloads with a hash, workspace folders, links and pinned git commits", async () => {
  const files = {
    "package.json": JSON.stringify({ name: "app", dependencies: { a: "^1.0.0", own: `github:org/own#${sha}` } }),
    "package-lock.json": npm({
      "node_modules/a": { version: "1.0.0", resolved: tgz("https://registry.npmjs.org", "a"), integrity: "sha512-x" },
      "node_modules/own": { version: "1.0.0", resolved: `git+ssh://git@github.com/org/own.git#${sha}` },
      "node_modules/b": { resolved: "packages/b", link: true },
      "packages/b": { name: "b", version: "1.0.0" },
      "node_modules/c": { version: "1.0.0", resolved: "file:vendor/c-1.0.0.tgz" },
      "node_modules/a/node_modules/inner": { version: "1.0.0", inBundle: true },
    }),
    ".npmrc": "# strict-ssl=false\nregistry=https://registry.npmjs.org/\n",
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "pass", JSON.stringify(result.raw.details));
});

test("fails on a lockfile entry downloaded over http without a hash, without credentials in the report", async () => {
  const files = { "package-lock.json": npm({ "node_modules/a": { version: "1.0.0", resolved: tgz("http://user:token@registry.example.com", "a") } }) };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.params?.host, d.line]), [["http", "registry.example.com", 9]]);
  assert.doesNotMatch(JSON.stringify(result.raw), /token/);
});

test("no finding for http with a hash: the package manager verifies the content", async () => {
  const lock = npm({ "node_modules/a": { version: "1.0.0", resolved: tgz("http://registry.npmjs.org", "a"), integrity: "sha512-x" } });
  assert.equal((await runRepoCheck(here, { "package-lock.json": lock })).status, "pass");
  const cargo = 'version = 3\n\n[[package]]\nname = "a"\nversion = "0.1.0"\nsource = "registry+http://crates.corp.example/index"\nchecksum = "abc"\n';
  assert.equal((await runRepoCheck(here, { "Cargo.lock": cargo })).status, "pass");
});

test("warns on npm, pnpm and yarn entries without an integrity hash", async () => {
  const lock = npm({ "node_modules/a": { version: "1.0.0", resolved: tgz("https://registry.npmjs.org", "a") } });
  assert.deepEqual(keys(await runRepoCheck(here, { "package-lock.json": lock })), ["no_integrity"]);

  const pnpm = "lockfileVersion: '9.0'\npackages:\n  a@1.0.0:\n    resolution: {integrity: sha512-x}\n  b@1.0.0:\n    resolution: {tarball: https://example.com/b-1.0.0.tgz}\n  c@1.0.0:\n    resolution: {directory: packages/c, type: directory}\n";
  const p = await runRepoCheck(here, { "pnpm-lock.yaml": pnpm });
  assert.equal(p.status, "warn");
  assert.deepEqual(p.raw.details?.map((d) => [d.key, d.params?.name, d.line]), [["no_integrity", "b", 6]]);

  // yarn classic before 1.10 has no integrity line, only the sha1 after "#" in the URL.
  const classic = `# yarn lockfile v1\n\na@^1.0.0:\n  version "1.0.0"\n  resolved "https://registry.yarnpkg.com/a/-/a-1.0.0.tgz#${sha}"\n\nb@^1.0.0:\n  version "1.0.0"\n  resolved "https://registry.yarnpkg.com/b/-/b-1.0.0.tgz"\n`;
  assert.deepEqual((await runRepoCheck(here, { "yarn.lock": classic })).raw.details?.map((d) => [d.key, d.params?.name]), [["no_integrity", "b"]]);

  const berry = '__metadata:\n  version: 8\n\n"a@npm:^1.0.0":\n  version: 1.0.0\n  resolution: "a@npm:1.0.0"\n  checksum: 10c0/abc\n\n"b@npm:^1.0.0":\n  version: 1.0.0\n  resolution: "b@npm:1.0.0"\n\n"app@workspace:.":\n  version: 0.0.0-use.local\n  resolution: "app@workspace:."\n' +
    // Berry keeps no checksum for platform packages.
    '\n"@esbuild/aix-ppc64@npm:0.25.0":\n  version: 0.25.0\n  resolution: "@esbuild/aix-ppc64@npm:0.25.0"\n  conditions: os=aix & cpu=ppc64\n';
  assert.deepEqual((await runRepoCheck(here, { "yarn.lock": berry })).raw.details?.map((d) => [d.key, d.params?.name, d.line]), [["no_integrity", "b", 11]]);
});

test("warns on git sources in lockfiles without a full commit", async () => {
  const pnpm = "lockfileVersion: '9.0'\npackages:\n  a@1.0.0:\n    resolution: {type: git, repo: https://github.com/org/a.git, commit: abc123}\n";
  assert.deepEqual(keys(await runRepoCheck(here, { "pnpm-lock.yaml": pnpm })), ["git_lockfile"]);
  const cargo = `version = 3\n\n[[package]]\nname = "a"\nversion = "0.1.0"\nsource = "git+https://github.com/org/a?branch=main#${sha}"\n`;
  assert.equal((await runRepoCheck(here, { "Cargo.lock": cargo })).status, "pass");
});

test("warns on git dependencies in manifests that follow a branch, a tag or nothing", async () => {
  const files = {
    "package.json": JSON.stringify({ name: "app", dependencies: { a: "github:org/a#main", b: "git+https://github.com/org/b.git", c: `org/c#${sha}` } }, null, 2),
    "Cargo.toml": `[package]\nname = "x"\n[dependencies]\nd = { git = "https://github.com/org/d", tag = "v1.0" }\ne = { git = "https://github.com/org/e", rev = "${sha}" }\n`,
    "pyproject.toml": '[project]\nname = "x"\ndependencies = ["f @ git+https://github.com/org/f.git@main"]\n',
    "pubspec.yaml": "name: x\ndependencies:\n  g:\n    git:\n      url: https://github.com/org/g\n",
    "requirements.txt": `git+https://github.com/org/h.git@v2#egg=h\ni @ git+https://github.com/org/i.git@${sha}\n`,
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(
    result.raw.details?.map((d) => [d.file, d.key, d.params?.name, d.params?.ref]).sort(),
    [
      ["Cargo.toml", "git_ref", "d", "v1.0"],
      ["package.json", "git_no_ref", "b", ""],
      ["package.json", "git_ref", "a", "main"],
      ["pubspec.yaml", "git_no_ref", "g", ""],
      ["pyproject.toml", "git_ref", "f", "main"],
      ["requirements.txt", "git_ref", "github.com/org/h", "v2"],
    ].sort(),
  );
});

test("checks package manager configs line by line", async () => {
  const files = {
    ".npmrc": "strict-ssl=false\n@corp:registry=http://npm.corp.example/\n",
    ".yarnrc.yml": 'enableStrictSsl: false\nnpmRegistryServer: "http://npm.corp.example"\n',
    "requirements.txt": "--extra-index-url https://pypi.corp.example/simple\n--trusted-host pypi.corp.example\n# --index-url http://old.example\nrequests==2.32.3\n",
    "requirements/cuda.txt": "--extra-index-url=http://pypi.corp.example/simple\n",
    "pip.conf": "[global]\nextra-index-url =\n    https://pypi.corp.example/simple\ntrusted-host = pypi.corp.example\n",
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.line, d.key]), [
    [".npmrc", 1, "strict_ssl"],
    [".npmrc", 2, "http_registry"],
    [".yarnrc.yml", 1, "strict_ssl"],
    [".yarnrc.yml", 2, "http_registry"],
    ["pip.conf", 4, "trusted_host"],
    ["requirements.txt", 2, "trusted_host"],
    ["requirements/cuda.txt", 1, "http_registry"],
  ]);
});

test("an extra index over https is no finding", async () => {
  const result = await runRepoCheck(here, { "requirements/cuda.txt": "--extra-index-url=https://download.pytorch.org/whl/cu121\ntorch==2.4.0\n" });
  assert.equal(result.status, "pass");
});

test("leaves fixture paths out", async () => {
  const files = { "test/fixtures/app/.npmrc": "registry=http://localhost:4873/\n", "package.json": JSON.stringify({ name: "app" }) };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

// "No evidence means pass" review (#85): a lockfile that could not be read was never looked at.
test("no pass when a lockfile could not be read", async () => {
  const result = await runRepoCheck(here, { "package.json": JSON.stringify({ name: "app" }), "package-lock.json": "{" });
  assert.equal(result.status, "info");
  assert.deepEqual(result.raw.details?.map((d) => d.file), ["package-lock.json"]);
});
