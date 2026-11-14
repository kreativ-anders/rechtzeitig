import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("notes stubs, simulated calls, elided code and lorem ipsum, most finds first", async () => {
  const result = await runRepoCheck(here, {
    "src/api/payments.ts": [
      "export async function charge() {",
      "  // Simulate API call",
      "  await new Promise((r) => setTimeout(r, 1000));",
      "  // In a real app, you would call Stripe here",
      '  throw new Error("Not implemented");',
      "}",
    ].join("\n"),
    "src/components/Hero.tsx": "export const Hero = () => <p>Lorem ipsum dolor sit amet</p>;",
    "app/views.py": "def export():\n    pass  # TODO: implement export\n",
    "src/routes.js": "// ... rest of the code\n",
  });
  assert.equal(result.status, "info");
  assert.deepEqual(result.raw.details?.slice(0, 3).map((d) => [d.file, d.key]), [
    ["src/api/payments.ts", "simulated"],
    ["src/api/payments.ts", "not_real"],
    ["src/api/payments.ts", "not_implemented"],
  ]);
  assert.equal(result.raw.details?.length, 6);
});

test("passes for real code, abstract methods, tests and stories", async () => {
  const result = await runRepoCheck(here, {
    "src/api/payments.ts": "// TODO: retry on 429\nexport const charge = (id: string) => stripe.charges.create({ id });",
    "app/base.py": "class Store:\n    def save(self):\n        raise NotImplementedError\n",
    "src/Hero.stories.tsx": "export const Default = () => <Hero text='Lorem ipsum' />;",
    "src/api.test.ts": "// Simulate API call\nconst mock = vi.fn();",
  });
  assert.equal(result.status, "pass");
});

test("skips a repository without code files", async () => {
  assert.equal((await runRepoCheck(here, { "README.md": "# Notes", "docs/guide.md": "Text" })).status, "skip");
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
