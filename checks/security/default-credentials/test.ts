import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("fails for secret fallbacks in JS, Python, PHP, Ruby and Go, naming only the variable", async () => {
  const result = await runRepoCheck(here, {
    "src/auth.ts": 'const secret = process.env.JWT_SECRET ?? "supersecret";',
    "src/session.js": "app.use(session({ secret: 'keyboard cat' }));",
    "app/config.py": 'SECRET_KEY = os.getenv("SECRET_KEY", "dev-key")',
    "config/auth.php": "'secret' => env('JWT_SECRET', 'changeme'),",
    "config/initializers/app.rb": "KEY = ENV.fetch('API_KEY', 'local')",
    "main.go": 'secret := getEnv("SESSION_SECRET", "secret")',
  });
  assert.equal(result.status, "fail");
  assert.ok(result.details.some((d) => d.includes("JWT_SECRET falls back")), result.details.join("\n"));
  assert.ok(!result.details.some((d) => d.includes("supersecret")));
  assert.equal(result.raw.details?.length, 6, result.details.join("\n"));
});

test("warns for a demo admin password in a seed", async () => {
  const result = await runRepoCheck(here, { "prisma/seed.ts": 'await db.user.create({ data: { email: "admin@example.com", password: await hash("admin123", 10) } });' });
  assert.equal(result.status, "warn");
});

test("passes for secrets without fallback, public keys, labels and tests", async () => {
  const result = await runRepoCheck(here, {
    "src/auth.ts": 'const secret = process.env.JWT_SECRET;\nif (!secret) throw new Error("JWT_SECRET missing");',
    "src/env.ts": 'const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "pk_test";\nconst ttl = process.env.TOKEN_TTL ?? "3600";',
    "src/i18n.ts": 'export const en = { password: "Password", email: "E-mail" };',
    ".projenrc.ts": "autoApproveOptions: { allowedUsernames: ['bot'], secret: 'GITHUB_TOKEN' },",
    "src/auth.test.ts": 'const secret = process.env.JWT_SECRET ?? "test-secret";',
    "app/config.py": 'SECRET_KEY = os.environ["SECRET_KEY"]\nDB_PASSWORD = os.getenv("DB_PASSWORD", "")',
  });
  assert.equal(result.status, "pass");
});
