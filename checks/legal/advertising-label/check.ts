import { capped, defineCheck, loadYaml, loaded, msg, pageLinks, pass, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

interface Network { name: string; hosts: string[]; params?: string[]; paths?: string[] }
const NETWORKS = loadYaml<{ networks: Network[] }>("data/affiliate.yml").networks;
const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** The affiliate network of a link, or undefined. */
function network(href: string | null): string | undefined {
  try {
    const url = new URL(href ?? "");
    const n = NETWORKS.find((x) => x.hosts.some((h) => under(url.hostname.toLowerCase(), h))
      && (!x.params || x.params.some((p) => url.searchParams.has(p)))
      && (!x.paths || x.paths.some((p) => url.pathname.startsWith(p))));
    return n?.name;
  } catch {
    return undefined;
  }
}

export default defineCheck({
  run(ctx) {
    const pages = ctx.observedPages;
    if (!pages.length) return skip(msg("no_pages"));
    const problems: Finding[] = [];
    let affiliatePages = 0;
    for (const page of pages) {
      const links = unique(pageLinks(page).flatMap((l) => {
        const name = network(l.href);
        return name ? [{ link: l, name }] : [];
      }), (x) => x.link.href ?? "");
      if (!links.length) continue;
      affiliatePages++;
      const text = loaded(page.js) ? page.js.text : page.noJs.text;
      // The label anywhere on the page, or on the link itself (aria-label, title or text such as "Anzeige").
      if (ctx.says("ad_label", text)) continue;
      const unlabelled = links.filter((x) => !ctx.says("ad_label", x.link.label));
      if (!unlabelled.length) continue;
      problems.push({ key: "unlabelled", params: { where: ctx.short(page.url), count: unlabelled.length, networks: [...new Set(unlabelled.map((x) => x.name))].join(", ") } });
      problems.push(...unlabelled.slice(0, 3).map((x) => ({ text: x.link.href ?? "" })));
    }
    if (problems.length) return warn(msg("missing", { count: problems.filter((p) => p.key).length }), capped(problems));
    if (affiliatePages) return pass(msg("labelled", { count: affiliatePages }));
    return pass(msg("none", { count: pages.length }));
  },
});
