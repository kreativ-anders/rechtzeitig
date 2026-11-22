import { capped, defineCheck, info, jsIncomplete, loadYaml, loaded, msg, pass, skip, warn, type Finding, type Timer } from "../../../src/sdk.ts";

const LIMITS = loadYaml<Record<string, { wait_ms: number; tolerance_s: number }>>("data/thresholds.yml")["dfa/fake-countdown"];
const CLOCK = loadYaml<{ countdown_clock: string[] }>("data/dark-patterns.yml").countdown_clock.map((p) => new RegExp(p));

/** Seconds left on a countdown text: three or four numbers from the largest unit down; undefined when implausible. */
function seconds(text: string): number | undefined {
  const n = (text.match(/\d+/g) ?? []).map(Number);
  if (n.length < 3 || n.length > 4) return undefined;
  const [s, m, h, d = 0] = n.reverse();
  if (s > 59 || m > 59 || (n.length === 4 && h > 23)) return undefined;
  return ((d * 24 + h) * 60 + m) * 60 + s;
}

/** Counts down between the two readings, by about the time waited. */
function running(t: Timer): boolean {
  const a = seconds(t.text);
  const b = seconds(t.later);
  return a !== undefined && b !== undefined && a > b && a - b <= LIMITS.wait_ms / 1000 + 2;
}

/** When the countdown reaches zero, in ms since 1970. */
const end = (t: Timer) => t.at + seconds(t.text)! * 1000;
const clock = (ms: number) => `${new Date(ms).toISOString().slice(11, 19)} UTC`;

export default defineCheck({
  run(ctx) {
    if (!ctx.sitePages.length) return jsIncomplete(ctx, info) ?? skip(msg("no_pages"));
    const restarts: Finding[] = [];
    const open: Finding[] = [];
    for (const page of ctx.sitePages) {
      const where = ctx.short(page.url);
      const first = page.js.timers.filter(running);
      if (!first.length) {
        const still = page.js.timers.find((t) => t.text === t.later && seconds(t.text) !== undefined && CLOCK.some((re) => re.test(t.text)));
        if (still) open.push({ key: "not_running", params: { where, text: still.text, seconds: LIMITS.wait_ms / 1000 } });
        continue;
      }
      // The second visit failed, timed out, was over the page cap, or showed no running countdown: not judged.
      const again = page.fresh && loaded(page.fresh) ? page.fresh.timers.filter(running) : [];
      if (!again.length) {
        open.push({ key: page.fresh && loaded(page.fresh) ? "not_again" : "not_reloaded", params: { where, text: first[0].text } });
        continue;
      }
      for (let i = 0; i < Math.min(first.length, again.length); i++) {
        const late = Math.round((end(again[i]) - end(first[i])) / 1000);
        if (Math.abs(late) <= LIMITS.tolerance_s) continue;
        restarts.push({ key: "restarts", params: { where, first: first[i].text, again: again[i].text, gap: Math.round((again[i].at - first[i].at) / 1000), end: clock(end(first[i])), later: clock(end(again[i])) } });
        break;
      }
    }
    if (restarts.length) return warn(msg("found", { count: restarts.length }), capped([...restarts, ...open]));
    if (open.length) return info(msg("not_judged", { count: open.length }), capped(open));
    return jsIncomplete(ctx, info) ?? pass(msg("none", { count: ctx.sitePages.length }));
  },
});
