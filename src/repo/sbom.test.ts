import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toCycloneDx } from "./sbom.ts";
import { repoFromFiles } from "../../test/helpers.ts";
import type { Component, RepoContext } from "../sdk.ts";

const lodash = (source: string): Component => ({ ecosystem: "npm", name: "lodash", version: "4.17.20", purl: "pkg:npm/lodash@4.17.20", dev: false, source });

test("a vulnerability affects the package in every lockfile", () => {
  const repo = {
    root: "/x/app",
    license: "MIT",
    components: [lodash("package-lock.json"), lodash("web/package-lock.json")],
    vulnerabilities: [{ id: "GHSA-1", purl: "pkg:npm/lodash@4.17.20", summary: "", severity: "HIGH" }],
  } as unknown as RepoContext;
  const bom = JSON.parse(toCycloneDx(repo, "0.0.0"));
  const refs = ["pkg:npm/lodash@4.17.20|package-lock.json", "pkg:npm/lodash@4.17.20|web/package-lock.json"];
  assert.deepEqual(bom.components.map((c: { "bom-ref": string }) => c["bom-ref"]), refs);
  assert.deepEqual(bom.vulnerabilities[0].affects, refs.map((ref) => ({ ref })));
});

// #99: recent pnpm writes the package manager and config dependencies as a first YAML document before the lockfile.
test("a pnpm-lock.yaml with several documents lists the packages of each", async () => {
  const lock = readFileSync(join(import.meta.dirname, "../../checks/security/hallucinated-packages/fixtures/pnpm-lock.multidoc.yaml"), "utf8");
  const repo = await repoFromFiles({ "pnpm-lock.yaml": lock });
  assert.deepEqual(repo.coverage.lockfiles.failed, []);
  const bom = JSON.parse(toCycloneDx(repo, "0.0.0"));
  const listed = bom.components.map((c: { name: string; group?: string; version: string; scope?: string }) => `${c.group ? `${c.group}/` : ""}${c.name}@${c.version}${c.scope ? ` ${c.scope}` : ""}`).sort();
  // The package manager comes first; it runs the install, so it is listed, as a development tool.
  assert.deepEqual(listed, [
    "@pnpm/exe.darwin-arm64@12.18.0 optional",
    "@pnpm/exe.linux-x64@12.18.0 optional",
    "@types/node@26.6.6 optional",
    "picomatch@4.0.7 required",
    "pnpm@12.18.0 optional",
    "undici-types@8.9.0 optional",
  ]);
});

test("a pnpm-lock.yaml with a document that does not parse is not read", async () => {
  const repo = await repoFromFiles({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\npackages:\n  a@1.0.0: {}\n---\npackages: [\n" });
  assert.deepEqual(repo.coverage.lockfiles.failed, [{ file: "pnpm-lock.yaml", reason: "invalid" }]);
});
