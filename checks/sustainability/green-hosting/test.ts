import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes for a host the Green Web Foundation lists as green", async () => {
  const result = await runFake(here, {}, { green: { host: "example.de", green: true, hostedBy: "Hetzner Online GmbH" } });
  assert.equal(result.status, "pass");
  assert.match(result.message, /Hetzner Online GmbH/);
});

test("warns for a host without evidence of green energy", async () => {
  assert.equal((await runFake(here, {}, { green: { host: "example.de", green: false } })).status, "warn");
});

test("skips when the lookup failed", async () => {
  assert.equal((await runFake(here, {}, { green: { host: "example.de", error: "timeout" } })).status, "skip");
});

test("skips without a lookup (local host, input off, tests)", async () => {
  assert.equal((await runFake(here)).status, "skip");
});
