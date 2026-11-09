import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

// A random-looking string of `n` characters from `chars`, the same on every run.
function noise(n: number, chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"): string {
  const bytes = createHash("sha512").update(`${n}${chars}`).digest();
  return Array.from({ length: n }, (_, i) => chars[(bytes[i % 64] + i * 7) % chars.length]).join("");
}
const hex = "0123456789abcdef";

// Built at runtime so the repository itself contains no secret-looking strings.
const stripe = ["sk", "live", noise(24)].join("_");
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

// Prefixes split so that no file of this repository contains a token-like string.
const tokens: Record<string, string> = {
  "OpenAI API key": ["sk", "proj", noise(48)].join("-"),
  "Anthropic API key": ["sk", "ant", "api03", noise(40)].join("-"),
  "GitHub token": ["ghp", noise(36)].join("_"),
  "GitLab token": ["glpat", noise(20)].join("-"),
  "npm access token": ["npm", noise(36)].join("_"),
  "Hugging Face token": ["hf", noise(34, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")].join("_"),
  "Supabase secret key": ["sb", "secret", noise(32)].join("_"),
  "Slack webhook": `https://${["hooks", "slack", "com"].join(".")}/services/${noise(44)}`,
  "Discord webhook": `https://${["discord", "com"].join(".")}/api/webhooks/123456789012345678/${noise(64)}`,
  "Shopify token or secret": ["shpat", noise(32, hex)].join("_"),
  "DigitalOcean token": ["dop", "v1", noise(64, hex)].join("_"),
  "Azure AD client secret": `${noise(3)}8${["Q", noise(34)].join("~")}`,
  "Private key": `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`,
};

for (const [name, token] of Object.entries(tokens)) {
  test(`fails for a ${name}`, async () => {
    const result = await runRepoCheck(here, { "src/config.ts": `const value = "${token}";` });
    assert.equal(result.status, "fail", `${name}: ${result.details?.join(" | ")}`);
    assert.ok(result.details?.[0]?.startsWith(`src/config.ts:1: ${name} (`), result.details?.[0]);
  });
}

test("fails for a Telegram bot token next to its name", async () => {
  const result = await runRepoCheck(here, { ".env": `TELEGRAM_BOT_TOKEN=839201457:${["A", noise(34)].join("")}` });
  assert.equal(result.status, "fail");
  assert.match(result.details?.[0] ?? "", /Telegram bot token/);
});

test("passes for placeholders and documented examples", async () => {
  const lines = [
    `STRIPE_KEY=${["sk", "live", "x".repeat(24)].join("_")}`,
    `AWS_ACCESS_KEY_ID=${["AKIA", "IOSFODNN7", "EXAMPLE"].join("")}`,
    `OPENAI_API_KEY=${["sk", "proj", `your_key_here_${noise(40)}`].join("-")}`,
  ];
  const result = await runRepoCheck(here, { "README.md": lines.join("\n") });
  assert.equal(result.status, "pass", result.details?.join(" | "));
});

test("warns for a random value under a secret-like name", async () => {
  const result = await runRepoCheck(here, { "config/app.py": `JWT_SECRET = "${noise(32)}"` });
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.key, "possible");
  assert.match(result.details?.[0] ?? "", /^config\/app\.py:1: Possible secret in an assignment/);
});

test("ignores references, short values and words under a secret-like name", async () => {
  const lines = [
    "apiKey: process.env.OPENAI_API_KEY,",
    'password = os.environ["DB_PASSWORD"]',
    "TOKEN=${{ secrets.DEPLOY_TOKEN }}",
    'const token = "short";',
    'secret: "this_is_not_a_real_secret_value"',
    "API_KEY=",
    'resetPasswordToken: "reset-password-token-route"',
  ];
  const result = await runRepoCheck(here, { "src/env.ts": lines.join("\n") });
  assert.equal(result.status, "pass", result.details?.join(" | "));
});

test("names a known token once, not also as a generic find", async () => {
  const result = await runRepoCheck(here, { ".env": `OPENAI_API_KEY=${tokens["OpenAI API key"]}` });
  assert.equal(result.status, "fail");
  assert.equal(result.details?.length, 1);
});

test("warns only for a key that may be meant to be public", async () => {
  const google = ["AIza", noise(35)].join("");
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
