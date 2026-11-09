import { test } from "node:test";
import assert from "node:assert/strict";
import { runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when www redirects", async () => {
  const result = await runFake(here, {}, { variant: { url: "https://www.example.de/", status: 200, finalUrl: "https://example.de/" } });
  assert.equal(result.status, "pass");
});

test("warns when the variant has a broken certificate", async () => {
  const result = await runFake(here, {}, { variant: { url: "https://www.example.de/", error: "ERR_TLS_CERT_ALTNAME_INVALID" } });
  assert.equal(result.status, "warn");
});

test("skips when the variant does not exist", async () => {
  assert.equal((await runFake(here, {})).status, "skip");
});

test("gives info when the variant answers without a redirect", async () => {
  const result = await runFake(here, {}, { variant: { url: "https://www.example.de/", status: 200, finalUrl: "https://www.example.de/" } });
  assert.equal(result.status, "info");
});

test("warns when the variant answers with an error status", async () => {
  const at = (status: number) => runFake(here, {}, { variant: { url: "https://www.example.de/", status, finalUrl: "https://example.de/" } });
  assert.equal((await at(400)).status, "warn");
  assert.equal((await at(399)).status, "pass");
});
