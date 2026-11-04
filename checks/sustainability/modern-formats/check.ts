import { capped, defineCheck, loadYaml, msg, pass, siteRequests, unique, warn, type Finding } from "../../../src/sdk.ts";

type Kind = "image" | "font";
const DATA = loadYaml<{ legacy: Record<Kind, { types: string[]; extensions: string[]; better: string }>; ignore: string[] }>(
  "data/file-formats.yml",
);
const IGNORE = new RegExp(DATA.ignore.join("|"), "i");

/** The legacy kind of a file, from its Content-Type or, without one, its extension. */
function legacyKind(url: string, contentType?: string): Kind | undefined {
  const type = contentType?.split(";")[0].trim().toLowerCase();
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  return (Object.keys(DATA.legacy) as Kind[]).find((k) =>
    type ? DATA.legacy[k].types.includes(type) : DATA.legacy[k].extensions.includes(ext),
  );
}

export default defineCheck({
  run(ctx) {
    const own = unique(siteRequests(ctx), (r) => r.url).filter(
      (r) => !ctx.isThirdParty(r.host) && (r.status ?? 200) < 400 && !IGNORE.test(new URL(r.url).pathname),
    );
    const found = own.flatMap((r) => {
      const kind = legacyKind(r.url, r.contentType);
      return kind ? [{ kind, url: r.url }] : [];
    });
    if (!found.length) return pass(msg("modern"));
    const details: Finding[] = capped(
      found.map(({ kind, url }) => ({ key: kind, params: { url: ctx.short(url), better: DATA.legacy[kind].better } })),
    );
    return warn(msg("legacy", { count: found.length }), details);
  },
});
