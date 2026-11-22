import {
  capped, codeFiles, defineCrossCheck, info, jsIncomplete, loadYaml, msg, pass, skip, thirdPartyServices, unreadResult, warn,
  type Finding, type Language,
} from "../../../src/sdk.ts";

const RANDOM = Object.fromEntries(
  Object.entries(loadYaml<{ random: Partial<Record<Language, string[]>> }>("data/dark-patterns.yml").random).map(([l, list]) => [l, (list ?? []).map((p) => new RegExp(p))]),
) as Partial<Record<Language, RegExp[]>>;
const WINDOW = loadYaml<Record<string, { window_lines: number }>>("data/thresholds.yml")["legal/fake-scarcity"].window_lines;

/** Code around a line as a visitor would read it: a placeholder or a concatenated variable becomes one word. */
const asText = (code: string) =>
  code
    .replace(/\$\{[^}]*\}|\{\{[^}]*\}\}|<%=?[^%]*%>|<\?=?[^?]*\?>/g, " N ")
    .replace(/["'`]\s*\+\s*[\w.()[\]]+\s*\+\s*["'`]/g, " N ")
    .replace(/["'`]\s*\+\s*[\w.()[\]]+|[\w.()[\]]+\s*\+\s*["'`]/g, " N ");

export default defineCrossCheck({
  run(ctx, repo) {
    const files = codeFiles(repo).filter((f) => RANDOM[f.language]);
    const finds: Finding[] = [];
    for (const { file, language } of files) {
      const text = repo.read(file);
      if (!text) continue;
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!RANDOM[language]!.some((re) => re.test(line))) return;
        const around = asText(lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join("\n"));
        const claim = ctx.matches("scarcity_claim", around)[0];
        if (claim) finds.push({ file, line: i + 1, key: "random_claim", params: { claim } });
      });
    }
    const widgets: Finding[] = [...thirdPartyServices(ctx).values()]
      .filter((s) => s.vendor?.purpose === "social proof")
      .map((s) => ({ key: "widget", params: { name: s.name, pages: [...s.pages].join(", ") } }));
    if (finds.length) return warn(msg("random", { count: finds.length }), [...capped(finds), ...widgets]);
    if (widgets.length) return info(msg("widgets", { count: widgets.length }), widgets);
    if (!files.length) return skip(msg("no_code"));
    return unreadResult(repo, files.map((f) => f.file)) ?? jsIncomplete(ctx, info) ?? pass(msg("none", { count: files.length }));
  },
});
