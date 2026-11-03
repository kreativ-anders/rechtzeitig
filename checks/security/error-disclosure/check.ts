import { defineCheck, fail, pass, startSnapshot, warn } from "../../../src/sdk.ts";

// Traces of PHP, Node, Python, Java, .NET, Laravel and SQL errors, and server paths.
const LEAKS = [
  /Fatal error:?.{0,200}/i,
  /Stack trace:.{0,120}/,
  /Traceback \(most recent call last\).{0,120}/,
  /Uncaught \w*(Error|Exception).{0,120}/,
  /(Warning|Notice|Deprecated): .{0,160} on line \d+/,
  /SQLSTATE\[\w+\].{0,120}/,
  /Whoops! There was an error/,
  /Werkzeug Debugger|DisallowedHost at|Exception in thread "/,
  /at [\w.$<>]+ \((\/|[A-Z]:\\)[^)]{0,120}:\d+:\d+\)/,
  /(\/var\/www|\/home\/[\w-]+|\/srv\/|[A-Z]:\\inetpub)[\w./\\-]*/,
];
const VERSION_HEADERS = ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version", "x-generator"];

export default defineCheck({
  run(ctx) {
    const leaks: string[] = [];
    for (const p of ctx.probes.filter((p) => p.kind === "error")) {
      for (const re of LEAKS) {
        const m = re.exec(p.body);
        if (m) leaks.push(`${p.path} (HTTP ${p.status}): ${m[0].replace(/<[^>]+>/g, "").slice(0, 160)}`);
      }
    }
    const headers = { ...startSnapshot(ctx).headers, ...Object.assign({}, ...ctx.probes.map((p) => p.headers)) };
    const versions = VERSION_HEADERS.filter((h) => headers[h] && (h !== "server" || /\d/.test(headers[h]))).map((h) => `${h}: ${headers[h]}`);

    if (leaks.length) return fail("Error pages show technical details that help attackers.", [...leaks, ...versions]);
    if (versions.length) return warn("Response headers reveal software and versions.", versions);
    return pass("Error pages and headers reveal no technical details.");
  },
});
