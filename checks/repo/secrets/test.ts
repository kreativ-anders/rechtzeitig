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

test("fails for a live Stripe key and redacts it", async () => {
  const result = await runRepoCheck(here, { "src/pay.ts": `const key = "${stripe}";` });
  assert.equal(result.status, "fail");
  assert.equal(result.details?.[0], "src/pay.ts:1: Stripe secret key (sk_live_…)");
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
