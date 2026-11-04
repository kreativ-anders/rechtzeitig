import { defineCheck, loadYaml, msg, pass, siteRequests, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

const { types, min_bytes: MIN } = loadYaml<{ compress: { types: string[]; min_bytes: number } }>("data/file-formats.yml").compress;
const TEXT = new Set(types);
const MAX = 20;

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
    const details: Finding[] = plain.slice(0, MAX).map((r) => ({ text: ctx.short(r.url) }));
    if (plain.length > MAX) details.push({ key: "more", params: { count: plain.length - MAX } });
    return warn(msg("uncompressed", { count: plain.length, total: files.length }), details);
  },
});
