import { FIXTURES, capped, defineCrossCheck, info, lineAt, loadYaml, msg, pass, skip, startSnapshot, warn, type Finding, type RepoContext } from "../../../src/sdk.ts";

const CONFIG = loadYaml<{ headers: string[]; meta: string[] }>("data/header-configs.yml");

/** A header the repository sets for every path, so also for the start page. */
interface Configured {
  name: string;
  value: string;
  file: string;
  line: number;
}

// Sources that match every path, so also "/".
const VERCEL_ALL = /^\/(?:\(\.\*\)\??|:\w+[*?]|:\w+\(\.\*\)\??)?$/;
const FIREBASE_ALL = new Set(["**", "/**", "**/*", "/**/*", "/"]);
const NETLIFY_ALL = new Set(["/*", "/"]);

type Header = { key?: unknown; value?: unknown };
const pairs = (list: unknown): Array<{ key: string; value: string }> =>
  Array.isArray(list) ? list.filter((h: Header) => typeof h?.key === "string").map((h: Header) => ({ key: h.key as string, value: String(h.value ?? "") })) : [];

/** vercel.json: headers[] with a catch-all source and no has/missing conditions. */
function vercel(repo: RepoContext, file: string): Configured[] {
  const json = repo.yaml<{ headers?: Array<{ source?: string; headers?: unknown; has?: unknown; missing?: unknown }> }>(file);
  const text = repo.read(file) ?? "";
  return (json?.headers ?? [])
    .filter((r) => typeof r?.source === "string" && VERCEL_ALL.test(r.source) && !r.has && !r.missing)
    .flatMap((r) => pairs(r.headers).map(({ key, value }) => ({ name: key, value, file, line: lineOf(text, key) })));
}

/** firebase.json: hosting (one site or a list) headers[] with a source that matches every path. */
function firebase(repo: RepoContext, file: string): Configured[] {
  const json = repo.yaml<{ hosting?: unknown }>(file);
  const text = repo.read(file) ?? "";
  const sites = (Array.isArray(json?.hosting) ? json.hosting : [json?.hosting]) as Array<{ headers?: Array<{ source?: string; glob?: string; headers?: unknown }> } | undefined>;
  return sites.flatMap((s) => s?.headers ?? [])
    .filter((r) => FIREBASE_ALL.has(r?.source ?? r?.glob ?? ""))
    .flatMap((r) => pairs(r.headers).map(({ key, value }) => ({ name: key, value, file, line: lineOf(text, key) })));
}

/** netlify.toml: [[headers]] blocks with for = "/*" and their [headers.values], single-line and """ multi-line strings. */
function netlify(text: string, file: string): Configured[] {
  const out: Configured[] = [];
  let block: { all: boolean; values: boolean } | undefined;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\[\[headers\]\]$/.test(line)) block = { all: false, values: false };
    else if (/^\[headers\.values\]$/.test(line) && block) block.values = true;
    else if (/^\[/.test(line)) block = undefined;
    else if (block && !block.values && /^for\s*=/.test(line)) block.all = NETLIFY_ALL.has(line.replace(/^for\s*=\s*/, "").replace(/^["']|["']$/g, ""));
    else if (block?.values && block.all) {
      const m = /^"?([A-Za-z0-9-]+)"?\s*=\s*(?:"""|'''|"|')(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2];
      const start = i;
      if (/^(?:"""|''')/.test(line.replace(/^[^=]*=\s*/, ""))) {
        // Multi-line string: up to the closing quotes.
        const parts = [value];
        while (!/("""|''')/.test(parts.at(-1)!) && i + 1 < lines.length) parts.push(lines[++i].trim());
        value = parts.join(" ").replace(/("""|''').*$/, "");
      } else value = value.replace(/["']\s*$/, "");
      out.push({ name: m[1], value, file, line: start + 1 });
    }
  }
  return out;
}

/** _headers (Netlify, Cloudflare Pages): a path line, then indented "Name: value" lines. */
function headersFile(text: string, file: string): Configured[] {
  const out: Configured[] = [];
  let all = false;
  text.split("\n").forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    if (!/^\s/.test(raw)) all = NETLIFY_ALL.has(raw.trim());
    else if (all) {
      const m = /^\s+([A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/.exec(raw);
      if (m) out.push({ name: m[1], value: m[2], file, line: i + 1 });
    }
  });
  return out;
}

/** .htaccess: Header set/always set outside <Files>, <If>, <Location> and similar blocks (<IfModule> counts). */
function htaccess(text: string, file: string): Configured[] {
  const out: Configured[] = [];
  let scoped = 0;
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (/^<(?!\/)(?!IfModule\b)\w+/i.test(line)) scoped++;
    else if (/^<\/(?!IfModule\b)\w+/i.test(line)) scoped = Math.max(0, scoped - 1);
    else if (!scoped) {
      const m = /^Header\s+(?:always\s+)?(?:set|append|merge|add)\s+"?([A-Za-z0-9-]+)"?\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))/i.exec(line);
      if (m) out.push({ name: m[1], value: m[2] ?? m[3] ?? "", file, line: i + 1 });
    }
  });
  return out;
}

const lineOf = (text: string, key: string) => {
  const at = text.indexOf(JSON.stringify(key));
  return at < 0 ? 1 : lineAt(text, at);
};
const norm = (v: string) => v.replace(/\s+/g, " ").replace(/\s*;\s*/g, "; ").replace(/;\s*$/, "").trim().toLowerCase();

/** Every header that a hosting config in the repository sets for all paths, outside fixtures and node_modules. */
function configured(repo: RepoContext): Configured[] {
  const files = repo.files.filter((f) => !FIXTURES.test(f) && !/(^|\/)node_modules\//.test(f));
  const name = (f: string) => f.split("/").pop();
  return files.flatMap((file) => {
    const text = repo.read(file);
    if (text === undefined) return [];
    switch (name(file)) {
      case "vercel.json": return vercel(repo, file);
      case "firebase.json": return firebase(repo, file);
      case "netlify.toml": return netlify(text, file);
      case "_headers": return headersFile(text, file);
      case ".htaccess": return htaccess(text, file);
      default: return [];
    }
  });
}

export default defineCrossCheck({
  run(ctx, repo) {
    const wanted = new Set(CONFIG.headers);
    const set = configured(repo).filter((c) => wanted.has(c.name.toLowerCase()));
    if (!set.length) return skip(msg("no_config"));
    const { headers, meta } = startSnapshot(ctx);
    const missing: Finding[] = [];
    const differs: Finding[] = [];
    const seen = new Set<string>();
    for (const c of set) {
      const name = c.name.toLowerCase();
      // Browsers ignore HSTS over plain HTTP, and servers often send it only over HTTPS.
      if (seen.has(name) || (name === "strict-transport-security" && !ctx.https)) continue;
      seen.add(name);
      const live = headers[name] ?? (CONFIG.meta.includes(name) ? meta[name] : undefined);
      const where = { file: c.file, line: c.line, params: { header: c.name } };
      if (live === undefined) missing.push({ ...where, key: "missing" });
      else if (norm(live) !== norm(c.value)) differs.push({ ...where, key: "differs" });
    }
    if (!seen.size) return skip(msg("no_config"));
    const page = ctx.short(startSnapshot(ctx).finalUrl || ctx.url);
    if (missing.length) return warn(msg("not_sent", { count: missing.length, page }), capped([...missing, ...differs]));
    if (differs.length) return info(msg("other_value", { count: differs.length, page }), capped(differs));
    return pass(msg("sent", { count: seen.size, page }));
  },
});
