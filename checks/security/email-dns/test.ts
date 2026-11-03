import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

test("passes with SPF and an enforcing DMARC policy", async () => {
  const result = await run({}, { dns: { spf: "v=spf1 mx -all", dmarc: "v=DMARC1; p=reject", mx: true } });
  assert.equal(result.status, "pass");
});

test("suggests a null SPF record for domains without mail", async () => {
  const result = await run({}, { dns: { mx: false } });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /v=spf1 -all/);
});

test("warns for DMARC p=none", async () => {
  const result = await run({}, { dns: { spf: "v=spf1 mx -all", dmarc: "v=DMARC1; p=none", mx: true } });
  assert.equal(result.status, "warn");
});
