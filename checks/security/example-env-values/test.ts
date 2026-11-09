import { test } from "node:test";
import assert from "node:assert/strict";
import { randomKey, runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

// Random-looking values built at runtime, so no key-like string is committed.
const random = (n: number, seed = 7) => randomKey(n, seed);

test("warns for real-looking values in templates without showing them", async () => {
  const value = random(40);
  const result = await runRepoCheck(here, {
    ".env.example": `OPENAI_API_KEY=${value}\nDATABASE_URL=postgresql://postgres:${random(18, 5)}@db.abcdefgh.supabase.co:5432/postgres\n`,
  });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => [d.line, d.key]), [[1, "real_value"], [2, "url_password"]]);
  assert.ok(!result.details.join("\n").includes(value));
});

test("passes for placeholders, local URLs and public names", async () => {
  const result = await runRepoCheck(here, {
    ".env.example": [
      "OPENAI_API_KEY=your-openai-api-key-here",
      "JWT_SECRET=",
      'STRIPE_SECRET_KEY="sk_test_..."',
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app",
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${random(40)}`,
      `SUPABASE_PROJECT_ID=${random(20)}`,
      "SESSION_SECRET=change-me-to-a-long-random-string",
    ].join("\n"),
  });
  assert.equal(result.status, "pass");
});

test("skips without a template", async () => {
  assert.equal((await runRepoCheck(here, { "package.json": "{}" })).status, "skip");
});
