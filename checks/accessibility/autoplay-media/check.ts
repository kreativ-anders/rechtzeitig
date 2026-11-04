import { capped, defineCheck, msg, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const videos = unique(
      ctx.sitePages.flatMap((p) => p.js.videos.map((v, i) => ({ ...v, page: ctx.short(p.url), index: i }))),
      (v) => v.url || `${v.page}#${v.index}`,
    );
    if (!videos.length) return skip(msg("no_videos"));
    const autoplay = videos.filter((v) => v.autoplay);
    if (!autoplay.length) return pass(msg("no_autoplay", { count: videos.length }));
    // Without the controls attribute the page may still have its own buttons; the scan cannot see them.
    const uncontrolled = autoplay.filter((v) => !v.controls);
    if (!uncontrolled.length) return pass(msg("controls", { count: autoplay.length }));
    const sound = uncontrolled.filter((v) => !v.muted);
    const findings: Finding[] = [...sound, ...uncontrolled.filter((v) => v.muted)].map((v) => ({
      key: v.muted ? "motion" : "sound",
      params: { url: v.url ? ctx.short(v.url) : "<video>", page: v.page },
    }));
    return warn(msg(sound.length ? "uncontrolled_sound" : "uncontrolled", { count: uncontrolled.length }), capped(findings));
  },
});
