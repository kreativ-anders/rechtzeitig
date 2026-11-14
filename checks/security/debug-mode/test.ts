import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("fails for DEBUG = True in Django settings and APP_DEBUG in a committed .env", async () => {
  const result = await runRepoCheck(here, {
    "mysite/settings.py": "SECRET_KEY = os.environ['SECRET_KEY']\nDEBUG = True\n",
    ".env.production": "APP_DEBUG=true\n",
    "config/environments/production.rb": "  config.consider_all_requests_local = true\n",
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["env_debug", "rails_local_requests", "django_debug"]);
});

test("warns for Flask debug and forced GraphQL introspection", async () => {
  const result = await runRepoCheck(here, {
    "app.py": "if __name__ == '__main__':\n    app.run(host='0.0.0.0', debug=True)\n",
    "src/server.ts": "const server = new ApolloServer({ typeDefs, resolvers, introspection: true });",
  });
  assert.equal(result.status, "warn");
});

test("passes for debug from the environment, dev settings and templates", async () => {
  const result = await runRepoCheck(here, {
    "mysite/settings.py": "DEBUG = os.environ.get('DEBUG') == '1'\n",
    "mysite/settings/dev.py": "DEBUG = True\n",
    ".env.example": "APP_DEBUG=true\n",
    ".env.development": "DEBUG=true\n",
    "src/server.ts": "new ApolloServer({ introspection: process.env.NODE_ENV !== 'production' });",
    "config/app.php": "    'debug' => (bool) env('APP_DEBUG', false),",
  });
  assert.equal(result.status, "pass");
});

// "No evidence means pass" review: a file the scan could not read may hold what this check looks for.
test("no pass when one of its files could not be read", async () => {
  const { TOO_LARGE } = await import("../../../test/helpers.ts");
  const clean = {"src/app.ts":"export const a = 1;"};
  assert.equal((await runRepoCheck(here, clean)).status, "pass");
  const result = await runRepoCheck(here, { ...clean, "src/big.ts": TOO_LARGE });
  assert.equal(result.status, "info");
  assert.deepEqual(result.details, ["src/big.ts: Not read: too large or only a Git LFS pointer."]);
});
