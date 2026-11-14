import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("fails for the Supabase service role key in a Vite app", async () => {
  const result = await runRepoCheck(here, {
    "vite.config.ts": "export default {}",
    // Built at runtime: security/secrets reports a secret name under a public prefix.
    "src/integrations/supabase/client.ts": `export const supabase = createClient(url, import.meta.env.${["VITE", "SUPABASE_SERVICE_ROLE_KEY"].join("_")});`,
  });
  assert.equal(result.status, "fail");
  assert.equal(result.raw.details?.[0].key, "service_role");
});

test("fails for firebase-admin and stripe in client components", async () => {
  const result = await runRepoCheck(here, {
    "components/Admin.vue": "<script setup>\nimport admin from 'firebase-admin';\n</script>",
    "app/checkout/page.tsx": "'use client'\nimport Stripe from 'stripe';\n",
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["stripe_secret", "firebase_admin"]);
});

test("passes for server code and public keys in the browser", async () => {
  const result = await runRepoCheck(here, {
    "vite.config.ts": "export default {}",
    "src/integrations/supabase/client.ts": "export const supabase = createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY);",
    "src/server/admin.ts": "createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);",
    "supabase/functions/admin/index.ts": "createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));",
    "app/api/pay/route.ts": "import Stripe from 'stripe';",
  });
  assert.equal(result.status, "pass");
});

test("skips without browser code", async () => {
  assert.equal((await runRepoCheck(here, { "server.js": "require('firebase-admin')" })).status, "skip");
});

// "No evidence means pass" review: a file the scan could not read may hold what this check looks for.
test("no pass when one of its files could not be read", async () => {
  const { TOO_LARGE } = await import("../../../test/helpers.ts");
  const clean = {"vite.config.ts":"export default {}","src/main.ts":"export const a = 1;"};
  assert.equal((await runRepoCheck(here, clean)).status, "pass");
  const result = await runRepoCheck(here, { ...clean, "src/big.ts": TOO_LARGE });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["src/big.ts: Not read: too large or only a Git LFS pointer."]);
});
