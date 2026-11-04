import { capped, defineCheck, loadYaml, msg, pass, siteRequests, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

const { types } = loadYaml<{ compress: { types: string[] } }>("data/file-formats.yml").compress;
const { min_bytes: MIN } = loadYaml<Record<string, { min_bytes: number }>>("data/thresholds.yml")["sustainability/compression"];
const TEXT = new Set(types);

export default defineCheck({
  run(ctx) {
    const files = unique(siteRequests(ctx), (r) => r.url).filter(
      (r) =>
        !ctx.isThirdParty(r.host) &&
        r.status === 200 &&
        TEXT.has((r.contentType ?? "").split(";")[0].trim().toLowerCase()) &&
        // Without a Content-Length (chunked) the size is unknown, so the file counts.
        (r.contentLength === undefined || r.contentLength >= MIN),
    );
    if (!files.length) return skip(msg("no_files"));
    const plain = files.filter((r) => !r.contentEncoding || r.contentEncoding === "identity");
    if (!plain.length) return pass(msg("compressed", { count: files.length }));
    const details: Finding[] = capped(plain.map((r) => ({ text: ctx.short(r.url) })));
    return warn(msg("uncompressed", { count: plain.length, total: files.length }), details);
  },
});
