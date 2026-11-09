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
