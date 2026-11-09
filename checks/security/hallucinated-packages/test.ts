import { test } from "node:test";
import assert from "node:assert/strict";
import { npmLock, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const pkg = (deps: Record<string, string>, extra: Record<string, unknown> = {}) => JSON.stringify({ name: "app", dependencies: deps, ...extra }, null, 2);

test("skips without declared dependencies", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
});

test("passes when every dependency is locked and no name looks like a typo", async () => {
  const files = {
    "package.json": pkg({ react: "^18.3.1", "@supabase/supabase-js": "^2.0.0", "my-lib": "workspace:*", local: "file:../local" }, { devDependencies: { vitest: "^2.0.0" } }),
    "package-lock.json": npmLock({ react: "18.3.1", "@supabase/supabase-js": "2.45.0", vitest: "2.1.0" }),
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "pass", JSON.stringify(result.raw.details));
});

test("warns on a dependency the lockfile does not contain", async () => {
  const files = { "package.json": pkg({ react: "^18.3.1", "react-ai-form-builder": "^1.0.0" }), "package-lock.json": npmLock({ react: "18.3.1" }) };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line, d.params?.name]), [["not_locked", 5, "react-ai-form-builder"]]);
});

test("warns on typo and scope look-alikes, also when they are locked", async () => {
  const files = {
    "package.json": pkg({ crossenv: "^1.0.0", "supabase-js": "^1.0.0", "expresss": "^4.0.0", colors: "^1.4.0", color: "^4.0.0" }),
    "package-lock.json": npmLock({ crossenv: "1.0.0", "supabase-js": "1.0.0", expresss: "4.0.0", colors: "1.4.0", color: "4.0.0" }),
  };
  const result = await runRepoCheck(here, files);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.params?.name, d.params?.of]), [
    ["typo", "crossenv", "cross-env"],
    ["scope", "supabase-js", "@supabase/supabase-js"],
    ["typo", "expresss", "express"],
  ]);
});

test("does not compare when an unread lockfile of another manager lies next to it", async () => {
  const files = { "package.json": pkg({ react: "^18.3.1", hono: "^4.0.0" }), "package-lock.json": npmLock({ react: "18.3.1" }), "bun.lock": "{}" };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("does not compare a nested project with a parent lockfile that does not list it", async () => {
  const files = {
    "package.json": pkg({ react: "^18.3.1" }),
    "package-lock.json": npmLock({ react: "18.3.1" }),
    "examples/demo/package.json": JSON.stringify({ name: "demo", dependencies: { vue: "^3.0.0" } }),
  };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});

test("checks workspace members against the root lockfile", async () => {
  const lock = JSON.parse(npmLock({ react: "18.3.1" }));
  lock.packages["packages/web"] = { name: "web", version: "1.0.0" };
  const files = {
    "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    "package-lock.json": JSON.stringify(lock),
    "packages/web/package.json": pkg({ react: "^18.3.1", root: "*", "left-padx": "^1.0.0" }),
  };
  const result = await runRepoCheck(here, files);
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.params?.name]), [["packages/web/package.json", "left-padx"]]);
});

test("reads pyproject.toml against uv.lock and requirements files by name", async () => {
  const files = {
    "pyproject.toml": '[project]\nname = "app"\ndependencies = [\n  "Requests[socks]>=2.31",\n  "fastapi>=0.110",\n  "pydantic_settings",\n]\n',
    "uv.lock": 'version = 1\n\n[[package]]\nname = "requests"\nversion = "2.32.3"\nsource = { registry = "https://pypi.org/simple" }\n\n[[package]]\nname = "pydantic-settings"\nversion = "2.4.0"\nsource = { registry = "https://pypi.org/simple" }\n',
    "tools/requirements.txt": "reqeusts==2.31.0\n",
  };
  const result = await runRepoCheck(here, files);
  assert.deepEqual(result.raw.details?.map((d) => [d.file, d.key, d.params?.name]), [
    ["pyproject.toml", "not_locked", "fastapi"],
    ["tools/requirements.txt", "typo", "reqeusts"],
  ]);
});

test("reads Cargo.toml tables and skips path dependencies", async () => {
  const files = {
    "Cargo.toml": '[package]\nname = "app"\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nlocal = { path = "../local" }\ntokio = "1.40"\n\n[dependencies.reqwest]\nversion = "0.12"\n',
    "Cargo.lock": 'version = 3\n\n[[package]]\nname = "serde"\nversion = "1.0.210"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n\n[[package]]\nname = "tokio"\nversion = "1.40.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n',
  };
  const result = await runRepoCheck(here, files);
  assert.deepEqual(result.raw.details?.map((d) => [d.key, d.line, d.params?.name]), [["not_locked", 9, "reqwest"]]);
});

test("ignores platform packages in composer.json", async () => {
  const files = {
    "composer.json": JSON.stringify({ require: { php: "^8.2", "ext-json": "*", "laravel/framework": "^11.0" } }),
    "composer.lock": JSON.stringify({ packages: [{ name: "laravel/framework", version: "v11.0.0" }] }),
  };
  assert.equal((await runRepoCheck(here, files)).status, "pass");
});
