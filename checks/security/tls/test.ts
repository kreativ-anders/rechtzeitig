import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeContext } from "../../../test/helpers.ts";
import check from "./check.ts";

const run = (...args: Parameters<typeof fakeContext>) => check.run(fakeContext(...args));

const tls = (over: object) => ({ tls: { protocol: "TLSv1.3", validTo: "2027-01-01", daysLeft: 60, authorized: true, ...over } });

test("passes for TLS 1.3 with a valid certificate", async () => {
  assert.equal((await run({}, tls({}))).status, "pass");
});

test("warns shortly before expiry", async () => {
  assert.equal((await run({}, tls({ daysLeft: 5 }))).status, "warn");
});

test("fails for an untrusted certificate", async () => {
  assert.equal((await run({}, tls({ authorized: false, error: "CERT_HAS_EXPIRED" }))).status, "fail");
});

test("fails for TLS 1.0", async () => {
  assert.equal((await run({}, tls({ protocol: "TLSv1" }))).status, "fail");
});
