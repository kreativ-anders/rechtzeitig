import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

const tls = (over: object) => ({ tls: { protocol: "TLSv1.3", validTo: "2027-01-01", daysLeft: 60, authorized: true, ...over } });

test("passes for TLS 1.3 with a valid certificate", async () => {
  assert.equal((await runFake(here, {}, tls({}))).status, "pass");
});

test("warns shortly before expiry", async () => {
  assert.equal((await runFake(here, {}, tls({ daysLeft: 5 }))).status, "warn");
});

test("fails for an untrusted certificate", async () => {
  assert.equal((await runFake(here, {}, tls({ authorized: false, error: "CERT_HAS_EXPIRED" }))).status, "fail");
});

test("fails for TLS 1.0", async () => {
  assert.equal((await runFake(here, {}, tls({ protocol: "TLSv1" }))).status, "fail");
});
