import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: "shop", dependencies: deps, devDependencies: dev }, null, 2);
const repo = { "package.json": pkg({ stripe: "^17.0.0", "@sentry/nextjs": "^9.0.0", react: "^19.0.0" }) };

test("passes when the policy names every service from the code", async () => {
  const result = await runCrossCheck(here, "named", repo);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, ["Stripe", "Sentry"]);
});

test("warns for a server SDK the policy does not name, at its line in package.json", async () => {
  const result = await runCrossCheck(here, "unnamed", repo);
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["package.json:5: Sentry (error tracking) via @sentry/nextjs, not named in the privacy policy"]);
});

test("ignores devDependencies and packages without a known service", async () => {
  const result = await runCrossCheck(here, "unnamed", { "package.json": pkg({ stripe: "1", react: "19" }, { "@sentry/cli": "2" }) });
  assert.equal(result.status, "pass");
});

test("matches AI SDKs to their provider", async () => {
  const result = await runCrossCheck(here, "unnamed", { "apps/web/package.json": pkg({ "@anthropic-ai/sdk": "1", openai: "5" }) });
  assert.equal(result.status, "warn");
  assert.match(result.details.join("\n"), /Anthropic \(AI model\) via @anthropic-ai\/sdk/);
  assert.match(result.details.join("\n"), /OpenAI \(AI model\) via openai/);
});

test("an unreadable package.json is never a pass", async () => {
  const result = await runCrossCheck(here, "named", { ...repo, "web/package.json": "{ broken" });
  assert.equal(result.status, "info");
});

test("skips without a privacy policy, and without a package.json", async () => {
  assert.equal((await runCrossCheck(here, "none", repo)).status, "skip");
  assert.equal((await runCrossCheck(here, "named", { "README.md": "x" })).status, "skip");
});

// Issue #40: payment SDKs from data/third-parties.yml are matched against the policy.
test("warns for a Mollie SDK the policy does not name", async () => {
  const result = await runCrossCheck(here, "unnamed", { "package.json": pkg({ "@mollie/api-client": "^4.0.0" }) });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["package.json:4: Mollie (payment) via @mollie/api-client, not named in the privacy policy"]);
});

// Issue #40: newsletter SDKs from data/third-parties.yml are matched against the policy.
test("warns for a Brevo SDK the policy does not name", async () => {
  const result = await runCrossCheck(here, "unnamed", { "package.json": pkg({ "@getbrevo/brevo": "^1.0.0" }) });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.details, ["package.json:4: Brevo (newsletter) via @getbrevo/brevo, not named in the privacy policy"]);
});
