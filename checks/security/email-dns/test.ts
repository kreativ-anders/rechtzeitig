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

test("a relaxed subdomain policy (sp=none) is not p=none", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", spf: "v=spf1 mx -all", dmarc: "v=DMARC1; p=reject; sp=none", mx: true } });
  assert.equal(result.status, "pass");
});

for (const all of ["+all", "?all", "all"]) {
  test(`warns for SPF ${all}`, async () => {
    const result = await runFake(here, {}, { dns: { domain: "example.de", spf: `v=spf1 mx ${all}`, dmarc: "v=DMARC1; p=reject", mx: true } });
    assert.equal(result.status, "warn");
    assert.match(result.details?.[0] ?? "", /every server/);
  });
}

test("names the domain that was queried, also for a subdomain site", async () => {
  const result = await runFake(here, { finalUrl: "https://shop.example.de/" }, { dns: { domain: "example.de", mx: true } });
  assert.match(result.message, /of example\.de\./);
  assert.ok(result.details?.includes('No DMARC record at _dmarc.example.de. Start with "v=DMARC1; p=quarantine".'));
});

test("suggests an enforcing DMARC policy right away for domains without mail", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", mx: false } });
  assert.ok(result.details?.includes('No DMARC record at _dmarc.example.de. The domain sends no mail, so publish "v=DMARC1; p=reject".'));
});

test("skips without a DNS lookup", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("reads SPF and DMARC case-insensitively", async () => {
  const result = await runFake(here, {}, { dns: { domain: "example.de", spf: "v=spf1 mx +ALL", dmarc: "v=DMARC1; P=None", mx: true } });
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.key), ["open_spf", "dmarc_none"]);
});
