import { capped, defineCrossCheck, info, loadYaml, msg, pass, siteCode, skip, warn, type Finding } from "../../../src/sdk.ts";

/** Bundler prefixes and relative parts in front of a source path: webpack://app/./src/x.ts → src/x.ts. */
const PREFIX = /^(?:[a-z][\w+.-]*:\/\/[^/]*\/?)?(?:\.{1,2}\/|\/)*/i;
const clean = (source: string) => source.replace(/[?#].*$/, "").replace(PREFIX, "");
/** Paths with fewer parts than this ("index.ts") match too many files to count (data/thresholds.yml). */
const MIN_PARTS = loadYaml<Record<string, { min_parts: number }>>("data/thresholds.yml")["security/source-maps"].min_parts;

/** Every ending of a path with at least MIN_PARTS parts: a/b/c.ts → a/b/c.ts, b/c.ts. */
const endings = (path: string) => {
  const parts = path.split("/");
  return parts.slice(0, Math.max(1, parts.length - MIN_PARTS + 1)).map((_, i) => parts.slice(i).join("/"));
};

export default defineCrossCheck({
  run(ctx, repo) {
    const scripts = siteCode(ctx).filter((c) => c.type === "script");
    if (!scripts.length) return skip(msg("no_scripts"));
    const maps = ctx.sourceMaps.filter((m) => m.status === 200 && m.sources.length);
    if (!maps.length) return pass(msg("none", { count: scripts.length }));

    // Files of the repository by every ending, so a map from apps/web finds apps/web/src/x.ts as src/x.ts.
    const own = new Set(repo.files.filter((f) => !/(^|\/)node_modules\//.test(f)).flatMap(endings));
    const exposed = new Set<string>();
    let withContent = false;
    for (const map of maps) {
      const hits = map.sources.map(clean).filter((s) => !/(^|\/)node_modules\//.test(s) && s.split("/").length >= MIN_PARTS && endings(s).some((e) => own.has(e)));
      for (const s of hits) exposed.add(s);
      if (hits.length && map.content) withContent = true;
    }
    const where: Finding[] = maps.map((m) => ({ text: m.url === "inline" ? ctx.short(m.script) : ctx.short(m.url) }));
    if (!exposed.size) return info(msg("public_maps", { count: maps.length }), where);
    const files: Finding[] = [...exposed].sort().map((text) => ({ text }));
    return warn(msg(withContent ? "source_public" : "paths_public", { count: exposed.size, maps: maps.length }), capped([...where, ...files]));
  },
});
