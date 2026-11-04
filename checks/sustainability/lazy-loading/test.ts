import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when images below the fold are lazy, ignoring a tracking pixel", async () => {
  const result = await runCheck(here, "lazy");
  assert.equal(result.status, "pass");
  assert.match(result.message, /1 image/);
});

test("warns for an image below the fold without loading=lazy, but not for a data: placeholder", async () => {
  const result = await runCheck(here, "eager");
  assert.equal(result.status, "warn");
  assert.deepEqual(result.raw.details?.map((d) => d.params?.url), ["/photo.svg?low"]);
});

test("skips when no image lies below the fold", async () => {
  assert.equal((await runCheck(here, "none")).status, "skip");
});

test("ignores images without size", async () => {
  const images = [{ url: "https://example.de/a.webp", loading: "", belowFold: true, width: 0, height: 0 }];
  assert.equal((await runFake(here, { images })).status, "skip");
});
