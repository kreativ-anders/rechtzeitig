import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "./scan.ts";
import { LOCKFILES } from "./lockfiles.ts";
import { cpuMs } from "../../test/helpers.ts";

test("go.mod: reads require blocks and single lines, fast on any input", async () => {
  const mod = "module x\n\nrequire (\n\tgithub.com/a/b v1.2.3\n\tgithub.com/c/d v0.1.0 // indirect\n)\n\nrequire github.com/e/f v2.0.0\n";
  assert.deepEqual(LOCKFILES["go.mod"](mod).map((c) => `${c.name}@${c.version}`), ["github.com/a/b@v1.2.3", "github.com/c/d@v0.1.0", "github.com/e/f@v2.0.0"]);
  assert.ok((await cpuMs(() => LOCKFILES["go.mod"](`require (\n${"\n".repeat(1_000_000)}`))) < 500);
});

// Symlinks are created at runtime, so the repository itself contains none.
function withLinks(git: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-links-"));
  writeFileSync(join(root, "README.md"), "hello");
  symlinkSync("/etc/hosts", join(root, "hosts.txt"));
  symlinkSync("/dev/zero", join(root, "zero.txt"));
  symlinkSync(tmpdir(), join(root, "outside"));
  if (git) execFileSync("git", ["-C", root, "init", "-q"]);
  return root;
}

for (const git of [false, true]) {
  test(`skips symlinks ${git ? "in a git repository" : "in a plain folder"}`, async () => {
    const started = Date.now();
    const repo = await scanRepo(withLinks(git), { osv: false });
    assert.deepEqual(repo?.files, ["README.md"]);
    assert.equal(repo?.read("README.md"), "hello");
    assert.equal(repo?.read("hosts.txt"), undefined);
    assert.equal(repo?.read("zero.txt"), undefined);
    assert.ok(Date.now() - started < 5000);
  });
}

// A repository with a submodule, built with git at runtime. file:// submodules need protocol.file.allow.
function withSubmodule(): { checkedOut: string; plain: string } {
  const base = mkdtempSync(join(tmpdir(), "rechtzeitig-sub-"));
  const config = ["user.name=t", "user.email=t@example.de", "commit.gpgsign=false", "protocol.file.allow=always", "init.defaultBranch=main"];
  const run = (cwd: string, ...args: string[]) => execFileSync("git", [...config.flatMap((c) => ["-c", c]), ...args], { cwd, stdio: "ignore" });
  const lib = join(base, "lib");
  mkdirSync(lib);
  run(lib, "init", "-q");
  writeFileSync(join(lib, "key.txt"), "token\n");
  writeFileSync(join(lib, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/lodash": { version: "4.17.20" } } }));
  run(lib, "add", ".");
  run(lib, "commit", "-q", "-m", "lib");
  const main = join(base, "main");
  mkdirSync(main);
  run(main, "init", "-q");
  writeFileSync(join(main, "package.json"), "{}");
  run(main, "submodule", "add", "-q", `file://${lib}`, "vendor-lib");
  run(main, "commit", "-q", "-am", "main");
  // A clone without --recurse-submodules, as actions/checkout does by default: the folder stays empty.
  run(base, "clone", "-q", `file://${main}`, "plain");
  return { checkedOut: main, plain: join(base, "plain") };
}

test("scans the files of a checked-out submodule and names one that is not checked out", async () => {
  const { checkedOut, plain } = withSubmodule();
  const full = await scanRepo(checkedOut, { osv: false });
  assert.ok(full?.files.includes("vendor-lib/key.txt"), String(full?.files));
  assert.deepEqual(full?.components.map((c) => `${c.name}@${c.version}`), ["lodash@4.17.20"]);
  assert.deepEqual(full?.coverage.submodules, [{ path: "vendor-lib", checkedOut: true }]);
  assert.equal(full?.coverage.listing, "git");
  const empty = await scanRepo(plain, { osv: false });
  assert.ok(!empty?.files.some((f) => f.startsWith("vendor-lib")), String(empty?.files));
  assert.deepEqual(empty?.coverage.submodules, [{ path: "vendor-lib", checkedOut: false }]);
});

test("coverage names large, binary and LFS files, lockfiles that gave nothing and package files without a parser", async () => {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-cov-"));
  const big = { lockfileVersion: 3, packages: Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [`node_modules/package-number-${i}`, { version: "1.0.0", license: "MIT" }])) };
  const files: Record<string, string | Buffer> = {
    "package.json": "{}",
    "package-lock.json": JSON.stringify(big),
    "huge.txt": "x".repeat(1_100_000),
    "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]),
    "web/package-lock.json": "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12345\n",
    "api/composer.lock": '{"packages":[]}',
    "py/requirements.txt": "not a pin\n",
    "java/pom.xml": "<project/>",
    "bun/bun.lock": "{}",
    ".npmrc": "@corp:registry=https://npm.corp.example/\n//npm.corp.example/:_authToken=secret\n",
    "go.mod": "module x\n\nrequire example.com/a v1.0.0\n\nreplace example.com/a => ../a\n",
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const repo = await scanRepo(root, { osv: false });
  const cov = repo!.coverage;
  assert.ok(Buffer.byteLength(files["package-lock.json"]) > 1_000_000);
  assert.equal(repo?.components.filter((c) => c.ecosystem === "npm").length, 20_000, "a lockfile above 1 MB is still read");
  assert.equal(cov.listing, "walk");
  assert.deepEqual(cov.large, ["huge.txt"]);
  assert.deepEqual(cov.binary, ["logo.png"]);
  assert.deepEqual(cov.lfs, ["web/package-lock.json"]);
  assert.deepEqual(cov.lockfiles.parsed, ["go.mod", "package-lock.json"]);
  assert.deepEqual(cov.lockfiles.empty, ["api/composer.lock", "py/requirements.txt"]);
  assert.deepEqual(cov.lockfiles.failed, [{ file: "web/package-lock.json", reason: "lfs" }]);
  assert.deepEqual(cov.unsupported, [{ file: "bun/bun.lock", ecosystem: "Bun" }, { file: "java/pom.xml", ecosystem: "Maven" }]);
  assert.deepEqual(cov.private, [
    { file: ".npmrc", kind: "registry", source: "npm.corp.example" },
    { file: "go.mod", kind: "replace", source: "example.com/a => ../a" },
  ]);
  assert.equal(repo?.read("huge.txt"), undefined);
});

// Issue #47: the first pass keeps no text; reads go through an LRU bounded by repo.cache_bytes and re-read evicted files.
test("LRU cache: a budget smaller than two files still returns the right text for every file", async () => {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-lru-"));
  writeFileSync(join(root, "a.txt"), "aaaa");
  writeFileSync(join(root, "b.txt"), "bbbbbb");
  const repo = await scanRepo(root, { osv: false, cacheBytes: 5 }); // smaller than a.txt + b.txt
  assert.equal(repo?.read("a.txt"), "aaaa");
  assert.equal(repo?.read("b.txt"), "bbbbbb", "b evicted a, both still readable");
  assert.equal(repo?.read("a.txt"), "aaaa", "a was re-read after its eviction");
});

test("LRU cache: many small files stay readable, large and binary unchanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "rechtzeitig-lru-many-"));
  for (let i = 0; i < 200; i++) writeFileSync(join(root, `f${i}.txt`), `content-${i}-`.repeat(20));
  writeFileSync(join(root, "huge.txt"), "x".repeat(2_000_000));
  const repo = await scanRepo(root, { osv: false, cacheBytes: 1000 });
  for (let i = 0; i < 200; i++) assert.equal(repo?.read(`f${i}.txt`), `content-${i}-`.repeat(20), `f${i}.txt re-read correctly`);
  assert.equal(repo?.read("huge.txt"), undefined);
  assert.deepEqual(repo?.coverage.large, ["huge.txt"]);
});
