import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when every topic is covered", async () => {
  assert.equal((await runCheck(here, "complete")).status, "pass");
});

test("understands plain English wording", async () => {
  const result = await runCheck(here, "plain-english", { language: "en" });
  assert.deepEqual(result.details ?? [], []);
});

test("understands plain German wording", async () => {
  const result = await runCheck(here, "plain-german");
  assert.deepEqual(result.details ?? [], []);
});

test("warns and lists missing topics", async () => {
  const result = await runCheck(here, "incomplete");
  assert.equal(result.status, "warn");
  assert.ok(result.details?.some((d) => d.startsWith("Storage period")));
  assert.ok(result.details?.some((d) => d.includes("supervisory authority")));
});

test("skips when there is no privacy policy", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});
