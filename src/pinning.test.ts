// rechtzeitig asks other repositories to pin actions to a commit SHA (security/actions-pinning), so it does the same.
// Dependabot updates the pins in action.yml and .github/workflows/, but not in examples/. This test catches the drift;
// `npm run sync-pins` (src/pins.ts) fixes it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLES, SOURCES, syncPins, usesIn } from "./pins.ts";

const uses = usesIn([...SOURCES(), ...EXAMPLES()]);

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
  const lines = drift.map((u) => `${u.file}: ${u.action} ${u.ref} # ${u.version}, elsewhere ${first.get(u.action)}`);
  assert.deepEqual(lines, [], `run: npm run sync-pins\n${lines.join("\n")}`);
});

test("sync-pins copies source pins into the examples and leaves actions without a source alone", () => {
  const cwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "pins-"));
  const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "examples/workflows"), { recursive: true });
  writeFileSync(join(root, "action.yml"), `runs:\n  steps:\n    - uses: actions/setup-node@${A} # v7.1.0\n`);
  writeFileSync(join(root, ".github/workflows/t.yml"), `jobs:\n  t:\n    steps:\n      - uses: actions/checkout@${A} # v7.0.1\n      - uses: ./\n`);
  writeFileSync(join(root, "examples/workflows/e.yml"), `steps:\n  - uses: actions/checkout@${B} # v6.0.0\n  - uses: "actions/setup-node@${B}" # v6\n  - uses: owner/rechtzeitig@${C} # v0.6.0\n`);
  try {
    process.chdir(root);
    assert.deepEqual(syncPins(), ["examples/workflows/e.yml"]);
    assert.equal(
      readFileSync("examples/workflows/e.yml", "utf8"),
      `steps:\n  - uses: actions/checkout@${A} # v7.0.1\n  - uses: "actions/setup-node@${A}" # v7.1.0\n  - uses: owner/rechtzeitig@${C} # v0.6.0\n`,
    );
    assert.deepEqual(syncPins(), []);
  } finally {
    process.chdir(cwd);
  }
});
