import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const project = { "package.json": "{}" };

test("passes with SECURITY.md in .github", async () => {
  const result = await runRepoCheck(here, { ...project, ".github/SECURITY.md": "# Security\n" });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, [".github/SECURITY.md"]);
});

test("passes with a security.txt in public/.well-known", async () => {
  const txt = "Contact: mailto:security@example.de\nExpires: 2099-01-01T00:00:00Z\n";
  assert.equal((await runRepoCheck(here, { ...project, "public/.well-known/security.txt": txt })).status, "pass");
});

test("warns when a committed security.txt has expired", async () => {
  const txt = "Contact: mailto:security@example.de\nExpires: 2020-01-01T00:00:00Z\n";
  const result = await runRepoCheck(here, { ...project, "SECURITY.md": "x", "static/.well-known/security.txt": txt });
  assert.equal(result.status, "warn");
});

test("notes a project without a security contact", async () => {
  assert.equal((await runRepoCheck(here, { ...project, "README.md": "x" })).status, "info");
});

test("skips a repository without a manifest, also when only fixtures have one", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "x" })).status, "skip");
  assert.equal((await runRepoCheck(here, { "test/fixtures/app/package.json": "{}" })).status, "skip");
});

test("counts a monorepo with manifests only in subfolders as a software project", async () => {
  assert.equal((await runRepoCheck(here, { "services/api/go.mod": "module api\n", "web/package.json": "{}" })).status, "info");
});

test("ignores an expired security.txt in test fixtures", async () => {
  const txt = "Contact: mailto:security@example.de\nExpires: 2020-01-01T00:00:00Z\n";
  const result = await runRepoCheck(here, { ...project, "SECURITY.md": "x", "checks/x/fixtures/expired/.well-known/security.txt": txt });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, ["SECURITY.md"]);
});

test("warns for a security.txt without a contact", async () => {
  const result = await runRepoCheck(here, { ...project, "public/.well-known/security.txt": "Expires: 2099-01-01T00:00:00.000Z\n" });
  assert.equal(result.status, "warn");
});

test("finds the policy in any case, in docs/, and security.txt at the root", async () => {
  for (const file of ["security.md", "docs/SECURITY.md"]) assert.equal((await runRepoCheck(here, { ...project, [file]: "Mail us." })).status, "pass", file);
  const txt = "Contact: mailto:security@example.de\nExpires: 2099-01-01T00:00:00.000Z\n";
  assert.equal((await runRepoCheck(here, { ...project, ".well-known/security.txt": txt })).status, "pass");
});
