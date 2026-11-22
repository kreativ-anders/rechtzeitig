import { contrast, defineCheck, loadYaml, msg, pass, skip, warn, type Finding, type Link, type Style } from "../../../src/sdk.ts";

const LIMITS = loadYaml<Record<string, { min_area_ratio: number; min_font_ratio: number; contrast: { readable: number; low: number } }>>("data/thresholds.yml")["privacy/consent-equal-choice"];

const area = (s: Style) => s.width * s.height;
const round = (n: number) => Math.round(n * 10) / 10;
/** The most prominent of several buttons: the largest visible one. */
const largest = (links: Link[]) => links.filter((l) => l.style && area(l.style) > 0).sort((a, b) => area(b.style!) - area(a.style!))[0];

export default defineCheck({
  run(ctx) {
    // A control the visitor cannot see or use is no choice.
    const banner = ctx.start.js.links.filter((l) => l.area === "banner" && !l.hidden);
    const accept = ctx.links("consent_accept", banner);
    if (!accept.length) return skip(msg("no_banner"));
    const isAccept = new Set(accept);
    const details: Finding[] = banner
      .filter((l) => !isAccept.has(l) && ctx.says("shaming", l.text))
      .map((l) => ({ key: "shaming", params: { text: l.text } }));

    const reject = ctx.links("consent_reject", banner).filter((l) => !isAccept.has(l));
    if (!reject.length && !details.length) return skip(msg("no_reject"));

    const yes = largest(accept);
    const no = largest(reject);
    // Without the rendered size of both buttons nothing was compared: no pass on missing evidence.
    if (reject.length && !(yes?.style && no?.style) && !details.length) return skip(msg("not_compared"));
    if (yes?.style && no?.style) {
      const names = { accept: yes.text, reject: no.text };
      const ratio = area(no.style) / area(yes.style);
      if (ratio < LIMITS.min_area_ratio) details.push({ key: "smaller", params: { ...names, percent: Math.round(ratio * 100) } });
      if (no.style.fontSize < yes.style.fontSize * LIMITS.min_font_ratio) {
        details.push({ key: "smaller_font", params: { ...names, reject_size: round(no.style.fontSize), accept_size: round(yes.style.fontSize) } });
      }
      const [cy, cn] = [contrast(yes.style), contrast(no.style)];
      if (cy !== undefined && cn !== undefined && cy >= LIMITS.contrast.readable && cn < LIMITS.contrast.low) {
        details.push({ key: "low_contrast", params: { ...names, reject_ratio: round(cn), accept_ratio: round(cy) } });
      }
    }
    if (details.length) return warn(msg("unequal", { count: details.length }), details);
    return pass(msg("equal", { accept: (yes ?? accept[0]).text, reject: (no ?? reject[0]).text }));
  },
});
