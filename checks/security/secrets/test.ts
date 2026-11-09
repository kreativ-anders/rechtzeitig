import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

// Built at runtime so the repository itself contains no secret-looking strings.
const stripe = ["sk", "live", "x".repeat(24)].join("_");
const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature1234567"].join(".");

test("passes for clean code", async () => {
  assert.equal((await runRepoCheck(here, { "src/app.ts": "const key = process.env.STRIPE_KEY;" })).status, "pass");
});

test("counts the files it could not read", async () => {
  const result = await runRepoCheck(here, { "src/app.ts": "ok", "logo.png": "PNG\u0000\u0000", "dump.sql": "x".repeat(1_100_000) });
  assert.equal(result.status, "pass");
  assert.equal(result.message, "No secrets found in 1 file read.");
  assert.deepEqual(result.details, ["2 files not read: binary, too large or only a Git LFS pointer."]);
});

test("fails for a live Stripe key and shows only its start and length", async () => {
  const result = await runRepoCheck(here, { "src/pay.ts": `const key = "${stripe}";` });
  assert.equal(result.status, "fail");
  assert.equal(result.details?.[0], "src/pay.ts:1: Stripe secret key (sk_l… (32 chars))");
});

test("fails for a Supabase service_role key but not for the anon key", async () => {
  const bad = await runRepoCheck(here, { "src/db.ts": `createClient(url, "${jwt({ role: "service_role" })}")` });
  const ok = await runRepoCheck(here, { "src/db.ts": `createClient(url, "${jwt({ role: "anon" })}")` });
  assert.equal(bad.status, "fail");
  assert.equal(ok.status, "pass");
});

test("fails for a secret under a public prefix", async () => {
  const result = await runRepoCheck(here, { ".env.example": `${["VITE", "STRIPE", "SECRET", "KEY"].join("_")}=` });
  assert.equal(result.status, "fail");
});

test("finds a service_role key after an anon key on the same line", async () => {
  const line = `const a = "${jwt({ role: "anon" })}", b = "${jwt({ role: "service_role" })}";`;
  const result = await runRepoCheck(here, { "src/db.ts": line });
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /Supabase service_role key/);
});

test("warns only for a key that may be meant to be public", async () => {
  const google = ["AIza", "x".repeat(35)].join("");
  const result = await runRepoCheck(here, { "src/map.ts": `const key = "${google}";` });
  assert.equal(result.status, "warn");
});

test("a token that only looks like a JWT is no service_role key", async () => {
  const fake = ["eyJ" + "a".repeat(12), "eyJzzzzzzzzzzzz", "signature1234567"].join(".");
  assert.equal((await runRepoCheck(here, { "src/db.ts": `const t = "${fake}";` })).status, "pass");
});

test("skips fixtures, snapshots, lockfiles, minified files and source maps", async () => {
  const line = `const key = "${stripe}";`;
  const skipped = ["fixtures/a.ts", "src/fixture/a.ts", "test/__snapshots__/a.snap", "Cargo.lock", "package-lock.json", "pnpm-lock.yaml",
    "src/app.min.js", "src/app.min.css", "src/app.js.map"];
  for (const file of skipped) assert.equal((await runRepoCheck(here, { [file]: line, "src/ok.ts": "ok" })).status, "pass", file);
  assert.equal((await runRepoCheck(here, { "src/fixtures.ts": line })).status, "fail");
});
