import { test } from "node:test";
import assert from "node:assert/strict";
import { toCycloneDx } from "./sbom.ts";
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
