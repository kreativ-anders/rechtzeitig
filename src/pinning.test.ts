// rechtzeitig asks other repositories to pin actions to a commit SHA (repo/actions-pinning), so it does the same.
// Dependabot updates the pins in action.yml and .github/workflows/, but not in examples/. This test catches the drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const USES = /^\s*-?\s*uses:\s*["']?([^"'\s#]+)(?:\s*#\s*(\S+))?/gm;
const dir = (d: string) => readdirSync(d).filter((f) => /\.ya?ml$/.test(f)).map((f) => `${d}/${f}`);
const files = ["action.yml", ...dir(".github/workflows"), ...dir("examples/workflows")];
const uses = files.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(USES)]
    .filter((m) => !m[1].startsWith("./"))
    .map((m) => ({ file, action: m[1].split("@")[0], ref: m[1].split("@")[1], version: m[2] })),
);

test("every action is pinned to a commit SHA with its version as a comment", () => {
  const bad = uses.filter((u) => !/^[0-9a-f]{40}$/.test(u.ref ?? "") || !/^v\d/.test(u.version ?? ""));
  assert.deepEqual(bad.map((u) => `${u.file}: ${u.action}@${u.ref}`), []);
});

test("the same action has the same pin in every file", () => {
  const first = new Map<string, string>();
  const drift = uses.filter((u) => {
    const pin = `${u.ref} # ${u.version}`;
    if (!first.has(u.action)) first.set(u.action, pin);
    return first.get(u.action) !== pin;
  });
  assert.deepEqual(drift.map((u) => `${u.file}: ${u.action} ${u.ref} # ${u.version}, elsewhere ${first.get(u.action)}`), []);
});
