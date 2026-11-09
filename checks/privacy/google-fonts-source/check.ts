import { capped, defineCrossCheck, directPackages, fail, info, loadYaml, msg, ownFiles, packageMatches, pass, siteRequests, type Finding } from "../../../src/sdk.ts";

const FONTS = loadYaml<{ hosts: string[]; packages: string[]; imports: string[]; files: string[] }>("data/fonts.yml");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HOST = new RegExp(`\\b(${FONTS.hosts.map(esc).join("|")})\\b`, "i");
const IMPORT = new RegExp(`["'](${FONTS.imports.map(esc).join("|")})["']`);
/** Templates, styles and code: the files that can load a font. */
const CODE = new RegExp(`\\.(${FONTS.files.map(esc).join("|")})$`, "i");
/** A Content-Security-Policy that allows the hosts does not load them. */
const CSP = /\b(font|style|default)-src\b/i;

export default defineCrossCheck({
  run(ctx, repo) {
    const pages = [...new Set(siteRequests(ctx).filter((r) => FONTS.hosts.includes(r.host)).map((r) => r.page))];

    // Where the repository loads Google Fonts (templates, CSS, config), and whether it already serves them itself.
    const refs: Finding[] = [];
    const selfHosted = new Set(directPackages(repo).packages.filter((p) => FONTS.packages.some((f) => packageMatches(p.name, f))).map((p) => p.name));
    for (const file of ownFiles(repo).filter((f) => CODE.test(f))) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        if (HOST.test(line) && !CSP.test(line)) refs.push({ file, line: i + 1, key: "reference" });
        const m = IMPORT.exec(line);
        if (m) selfHosted.add(m[1]);
      });
    }
    // Files too large to read or only a Git LFS pointer may hold a reference; binary files cannot.
    const unread = repo.coverage.large.length + repo.coverage.lfs.length;
    const notes: Finding[] = [
      ...(selfHosted.size ? [{ key: "self_hosted", params: { packages: [...selfHosted].join(", ") } }] : []),
      ...(unread ? [{ key: "unread", params: { count: unread } }] : []),
    ];

    if (pages.length) {
      const loads: Finding[] = pages.map((text) => ({ text }));
      // Loaded, but not from the repository's code: a theme, plugin or CMS, or a build older than the repository.
      if (!refs.length) return fail(msg("loaded_elsewhere", { count: pages.length }), capped([...loads, ...notes]));
      return fail(msg("loaded", { count: pages.length, refs: refs.length }), capped([...refs, ...loads, ...notes]));
    }
    // Not loaded on the visited pages, but the code references it: other pages may still load it.
    if (refs.length) return info(msg("referenced", { count: refs.length }), capped([...refs, ...notes]));
    if (unread) return info(msg("not_loaded_unread", { count: unread }), notes);
    return pass(msg("none"), notes);
  },
});
