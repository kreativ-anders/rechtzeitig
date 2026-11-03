import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes with SPF and an enforcing DMARC policy", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", spf: "v=spf1 mx -all", dmarc: "v=DMARC1; p=reject", mx: true } });
  assert.equal(result.status, "pass");
});

test("suggests a null SPF record for domains without mail", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", mx: false } });
  assert.equal(result.status, "warn");
  assert.match(result.details?.[0] ?? "", /v=spf1 -all/);
});

test("warns for DMARC p=none", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", spf: "v=spf1 mx -all", dmarc: "v=DMARC1; p=none", mx: true } });
  assert.equal(result.status, "warn");
});
