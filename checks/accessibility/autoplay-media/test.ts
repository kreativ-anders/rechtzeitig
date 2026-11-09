import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, runFake, runSite } from "../../../test/helpers.ts";

const here = import.meta.dirname;

test("passes when autoplaying videos have controls", async () => {
  const result = await runCheck(here, "controls");
  assert.equal(result.status, "pass");
  assert.match(result.message, /1 video/);
});

test("warns for a muted video that plays automatically without controls", async () => {
  const result = await runCheck(here, "silent");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.key, "uncontrolled");
  assert.deepEqual(result.raw.details?.map((d) => `${d.key} ${d.params?.url}`), ["motion /hero.mp4"]);
});

test("names autoplaying sound first", async () => {
  const result = await runCheck(here, "sound");
  assert.equal(result.status, "warn");
  assert.equal(result.raw.message.key, "uncontrolled_sound");
  assert.deepEqual(result.raw.details?.map((d) => `${d.key} ${d.params?.url}`), ["sound /talk.mp4", "motion /hero.mp4"]);
});

test("passes for videos that do not start by themselves", async () => {
  const videos = [{ url: "https://example.de/a.mp4", autoplay: false, muted: false, controls: false, loop: false }];
  assert.equal((await runFake(here, { videos })).status, "pass");
});

test("skips without videos", async () => {
  assert.equal((await runFake(here)).status, "skip");
});

test("counts a video on several pages once, videos without a URL each", async () => {
  const video = (url: string) => ({ url, autoplay: false, muted: false, controls: false, loop: false });
  const a = "https://example.de/a.mp4";
  const result = await runSite(here, { "/": { videos: [video(a), video(""), video("")] }, "/b": { videos: [video(a), video("")] } });
  assert.equal(result.status, "pass");
  assert.match(result.message, /\b4 videos/);
});
