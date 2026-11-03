import { defineCheck, fail, loadYaml, pass, startSnapshot, warn } from "../../../src/sdk.ts";

const DATA = loadYaml<{ patterns: string[]; version_headers: string[] }>("data/leaks.yml");
const LEAKS = DATA.patterns.map((p) => new RegExp(p));
const VERSION_HEADERS = DATA.version_headers;

// Text a visitor sees: no scripts, styles, tags or attributes (an href="/home/about" is no server path).
const visibleText = (html: string) =>
  html.replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");

export default defineCheck({
  run(ctx) {
    const leaks: string[] = [];
    for (const p of ctx.probes.filter((p) => p.kind === "error")) {
      const text = visibleText(p.body);
      for (const re of LEAKS) {
        const m = re.exec(text);
        if (m) leaks.push(`${p.path} (HTTP ${p.status}): ${m[0].slice(0, 160)}`);
      }
    }
    const headers = { ...startSnapshot(ctx).headers, ...Object.assign({}, ...ctx.probes.map((p) => p.headers)) };
    const versions = VERSION_HEADERS.filter((h) => headers[h] && (h !== "server" || /\d/.test(headers[h]))).map((h) => `${h}: ${headers[h]}`);

    if (leaks.length) return fail("Error pages show technical details that help attackers.", [...leaks, ...versions]);
    if (versions.length) return warn("Response headers reveal software and versions.", versions);
    return pass("Error pages and headers reveal no technical details.");
  },
});
