import { defineCheck, loadYaml, msg, pass, skip, warn, type Finding, type Link, type Style } from "../../../src/sdk.ts";

const LIMITS = loadYaml<{ min_area_ratio: number; min_font_ratio: number; contrast: { readable: number; low: number } }>("data/consent-design.yml");

type Rgba = [number, number, number, number];

/** Parses a computed rgb()/rgba() color; undefined for other formats (oklch, color()). */
function parse(color: string): Rgba | undefined {
  const m = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return undefined;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** Relative luminance, WCAG 2.1. */
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const over = (top: Rgba, under: number[]) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));

/** WCAG contrast ratio of text against its background, both laid over white; undefined when a color cannot be read. */
function contrast(style: Style): number | undefined {
  const fg = parse(style.color);
  const bg = parse(style.background);
  if (!fg || !bg) return undefined;
  const back = over(bg, [255, 255, 255]);
  const [light, dark] = [luminance(over(fg, back)), luminance(back)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const area = (s: Style) => s.width * s.height;
const round = (n: number) => Math.round(n * 10) / 10;
/** The most prominent of several buttons: the largest visible one. */
const largest = (links: Link[]) => links.filter((l) => l.style && area(l.style) > 0).sort((a, b) => area(b.style!) - area(a.style!))[0];

export default defineCheck({
  run(ctx) {
    const banner = ctx.start.js.links.filter((l) => l.area === "banner");
    const accept = ctx.links("consent_accept", banner);
    if (!accept.length) return skip(msg("no_banner"));
    const isAccept = new Set(accept);
    const details: Finding[] = banner
      .filter((l) => !isAccept.has(l) && ctx.says("consent_shaming", l.text))
      .map((l) => ({ key: "shaming", params: { text: l.text } }));

    const reject = ctx.links("consent_reject", banner).filter((l) => !isAccept.has(l));
    if (!reject.length && !details.length) return skip(msg("no_reject"));

    const yes = largest(accept);
    const no = largest(reject);
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
