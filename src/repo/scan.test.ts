import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "./scan.ts";

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
