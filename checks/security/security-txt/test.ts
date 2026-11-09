import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;
const probe = (body: string, status = 200) => ({ path: "/.well-known/security.txt", kind: "public" as const, status, headers: {}, body, exposed: false });

test("passes for a security.txt with Contact and a future Expires", async () => {
  const result = await runCheck(here, "good");
  assert.equal(result.status, "pass");
  assert.deepEqual(result.details, ["mailto:security@example.de"]);
});

test("warns when security.txt has expired", async () => {
  assert.equal((await runCheck(here, "expired")).status, "warn");
});

test("notes a missing security.txt", async () => {
  assert.equal((await runCheck(here, "missing")).status, "info");
});

test("warns without Expires", async () => {
  assert.equal((await runFake(here, {}, { probes: [probe("Contact: mailto:a@example.de\n")] })).status, "warn");
});

test("ignores an HTML page served for every path", async () => {
  assert.equal((await runFake(here, {}, { probes: [probe("<html><p>Contact: us</p></html>")] })).status, "info");
});

test("names the first contact", async () => {
  const body = "Contact: mailto:a@example.de\nContact: https://example.de/security\nExpires: 2099-01-01T00:00:00.000Z\n";
  const result = await runFake(here, {}, { probes: [probe(body)] });
  assert.equal(result.status, "pass");
  assert.equal(result.raw.message.params?.contact, "mailto:a@example.de");
});
