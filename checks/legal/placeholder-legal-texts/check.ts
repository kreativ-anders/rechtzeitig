import { capped, defineCrossCheck, extensions, fail, info, loaded, loadYaml, msg, needLegalPage, ownFiles, pageName, pass, type Finding, type Page } from "../../../src/sdk.ts";

const DATA = loadYaml<{ extensions: string[]; paths: string }>("data/legal-texts.yml");
const CONTENT = extensions(DATA.extensions);
const LEGAL_PATH = new RegExp(DATA.paths, "i");
const CONCEPTS = ["imprint", "privacy"] as const;
const short = (s: string) => (s.length > 120 ? `${s.slice(0, 119)}…` : s);

export default defineCrossCheck({
  run(ctx, repo) {
    const pages = CONCEPTS.flatMap((concept) => {
      const page = ctx.legalPage(concept)?.page;
      return page && loaded(page.js) ? [{ concept, page }] : [];
    }) satisfies Array<{ concept: string; page: Page }>;
    if (!pages.length) {
      // Neither page loaded: the skip of needLegalPage, which names the check that looks for the link.
      const missing = needLegalPage(ctx, "imprint");
      if ("status" in missing) return missing;
    }

    // Lines of the live legal pages with a placeholder, and the placeholders themselves.
    const live: Finding[] = [];
    const words = new Set<string>();
    for (const { concept, page } of pages) {
      for (const line of page.js.text.split("\n")) {
        const found = ctx.matches("placeholder", line);
        if (!found.length) continue;
        found.forEach((w) => words.add(w));
        live.push({ key: "on_page", params: { page: pageName(concept), where: ctx.short(page.url), text: short(line.trim()) } });
      }
    }

    // The repository: files of legal pages always; any content file when the live page shows a placeholder, to find its source.
    const files = ownFiles(repo).filter((f) => CONTENT.test(f) && (words.size > 0 || LEGAL_PATH.test(f)));
    const source: Finding[] = [];
    const repoOnly: Finding[] = [];
    const unread = files.filter((f) => LEGAL_PATH.test(f) && (repo.coverage.large.includes(f) || repo.coverage.lfs.includes(f)));
    for (const file of files) {
      const text = repo.read(file);
      if (text === undefined) continue;
      text.split("\n").forEach((line, i) => {
        const found = ctx.matches("placeholder", line);
        if (!found.length) return;
        const where = { file, line: i + 1, params: { text: found.join(", ") } };
        if (found.some((w) => words.has(w))) source.push({ ...where, key: "source" });
        else if (LEGAL_PATH.test(file)) repoOnly.push({ ...where, key: "repo_only" });
      });
    }

    if (live.length) {
      const notes: Finding[] = source.length ? source : [{ key: "no_source" }];
      return fail(msg("live", { count: live.length }), capped([...live, ...notes]));
    }
    // Only in the repository: a change not deployed yet, or a template the site does not use.
    if (repoOnly.length) return info(msg("in_repo", { count: repoOnly.length }), capped(repoOnly));
    if (unread.length) return info(msg("unread", { count: unread.length }), capped(unread.map((file) => ({ file, key: "unread_file" }))));
    return pass(msg("none", { count: pages.length }));
  },
});
