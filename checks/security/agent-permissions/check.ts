import { FIXTURES, capped, defineRepoCheck, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

interface Runner { skip: string; pinned: string }
const DATA = loadYaml<{
  config: string[];
  mcp_server_keys: string[];
  allow_all_rules: string[];
  bypass_modes: string[];
  skip_flags: Array<{ flag: string; agent?: string }>;
  flag_files: string[];
  codex_unsafe: Record<string, string>;
  runners: Record<string, Runner>;
  runner_subcommands: Record<string, string>;
  loopback_hosts: string[];
  filesystem_server: string;
  filesystem_roots: string[];
}>("data/agent-files.yml");

const CONFIG = DATA.config.map((p) => new RegExp(p));
const FLAG_FILES = DATA.flag_files.map((p) => new RegExp(p));
const ALLOW_ALL = DATA.allow_all_rules.map((p) => new RegExp(p));
const SKIP_FLAGS = DATA.skip_flags.map((f) => ({ flag: new RegExp(f.flag), agent: f.agent ? new RegExp(f.agent) : undefined }));
const RUNNERS = Object.entries(DATA.runners).map(([cmd, r]) => [cmd, { skip: new RegExp(r.skip), pinned: new RegExp(r.pinned) }] as const);
const CLAUDE_SETTINGS = /(^|\/)\.claude\/settings(\.local)?\.json$/;
const CODEX = /(^|\/)\.codex\/config\.toml$/;

interface Server { command?: unknown; args?: unknown; url?: unknown; serverUrl?: unknown; httpUrl?: unknown }

/** JSON with // and /* comments and trailing commas (VS Code and Zed allow them), parsed; undefined if not. */
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Strip comments outside strings, then trailing commas.
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        const start = i;
        for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
        out += text.slice(start, i + 1);
      } else if (c === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
        out += "\n";
      } else if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        out += text.slice(i, end < 0 ? text.length : end + 2).replace(/[^\n]/g, "");
        i = end < 0 ? text.length : end + 1;
      } else out += c;
    }
    try {
      return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return undefined;
    }
  }
}

/** MCP servers of a config file, by name, wherever the client keeps them. */
function servers(doc: unknown): Array<[string, Server]> {
  if (!doc || typeof doc !== "object") return [];
  const out: Array<[string, Server]> = [];
  for (const key of DATA.mcp_server_keys) {
    let list = (doc as Record<string, unknown>)[key];
    // VS Code settings nest them: "mcp": { "servers": { ... } }.
    if (key === "mcp" && list && typeof list === "object" && "servers" in list) list = (list as Record<string, unknown>).servers;
    if (!list || typeof list !== "object") continue;
    for (const [name, s] of Object.entries(list as Record<string, unknown>)) if (s && typeof s === "object") out.push([name, s as Server]);
  }
  return out;
}

const lineOf = (lines: string[], needle: string, from = 0) => {
  const i = lines.findIndex((l, n) => n >= from && l.includes(needle));
  return i >= 0 ? i + 1 : undefined;
};

/** The package a runner command starts and whether its version is fixed, or undefined if it is no runner. */
function runnerPackage(command: string, args: string[]): { pkg: string; pinned: boolean } | undefined {
  const base = command.split(/[\\/]/).pop()?.replace(/\.(cmd|exe)$/, "") ?? "";
  let rest = args;
  let runner = RUNNERS.find(([cmd]) => cmd === base)?.[1];
  const sub = DATA.runner_subcommands[base];
  if (!runner && sub && rest[0] === sub) {
    runner = RUNNERS.find(([cmd]) => cmd === "npx")?.[1];
    rest = rest.slice(1);
  }
  if (!runner) return undefined;
  const pkg = rest.find((a) => !runner.skip.test(a) && !a.startsWith("-"));
  return pkg ? { pkg, pinned: runner.pinned.test(pkg) } : undefined;
}

function insecureUrl(url: unknown): boolean {
  if (typeof url !== "string" || !/^http:\/\//i.test(url)) return false;
  try {
    return !DATA.loopback_hosts.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export default defineRepoCheck({
  run(repo) {
    const configs = repo.files.filter((f) => !FIXTURES.test(f) && CONFIG.some((re) => re.test(f)));
    const scripts = repo.files.filter((f) => !FIXTURES.test(f) && FLAG_FILES.some((re) => re.test(f)));
    if (!configs.length && !scripts.length) return skip(msg("no_files"));
    const found: Finding[] = [];

    for (const file of configs) {
      const text = repo.read(file);
      if (!text) continue;
      const lines = text.split("\n");
      if (CODEX.test(file)) {
        const set = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*"${DATA.codex_unsafe[k]}"`, "m").test(text);
        if (Object.keys(DATA.codex_unsafe).every(set)) {
          found.push({ file, line: lineOf(lines, Object.keys(DATA.codex_unsafe)[0]), key: "codex_unsafe" });
        }
        continue;
      }
      const doc = parseJsonc(text) as Record<string, unknown> | undefined;
      if (!doc || typeof doc !== "object") continue;
      if (CLAUDE_SETTINGS.test(file)) {
        const perms = (doc.permissions ?? {}) as { allow?: unknown; defaultMode?: unknown };
        for (const rule of Array.isArray(perms.allow) ? perms.allow : []) {
          if (typeof rule === "string" && ALLOW_ALL.some((re) => re.test(rule.trim()))) {
            found.push({ file, line: lineOf(lines, JSON.stringify(rule)), key: "allow_all", params: { rule } });
          }
        }
        if (typeof perms.defaultMode === "string" && DATA.bypass_modes.includes(perms.defaultMode)) {
          found.push({ file, line: lineOf(lines, "defaultMode"), key: "bypass_mode", params: { mode: perms.defaultMode } });
        }
        if (doc.enableAllProjectMcpServers === true) found.push({ file, line: lineOf(lines, "enableAllProjectMcpServers"), key: "all_mcp_servers" });
      }
      for (const [name, s] of servers(doc)) {
        const at = lineOf(lines, JSON.stringify(name));
        const args = Array.isArray(s.args) ? s.args.map(String) : [];
        if (typeof s.command === "string") {
          // "command": "npx -y pkg" in one string happens too.
          const [cmd, ...inline] = s.command.trim().split(/\s+/);
          const run = runnerPackage(cmd, [...inline, ...args]);
          if (run && !run.pinned) found.push({ file, line: lineOf(lines, run.pkg, (at ?? 1) - 1) ?? at, key: "unpinned", params: { server: name, pkg: run.pkg } });
          const fs = args.indexOf(DATA.filesystem_server) >= 0 || args.some((a) => a.startsWith(`${DATA.filesystem_server}@`));
          const root = fs ? args.find((a) => DATA.filesystem_roots.includes(a)) : undefined;
          if (root) found.push({ file, line: at, key: "filesystem_root", params: { server: name, root } });
        }
        for (const url of [s.url, s.serverUrl, s.httpUrl]) {
          if (insecureUrl(url)) found.push({ file, line: lineOf(lines, String(url)) ?? at, key: "http", params: { server: name } });
        }
      }
    }

    for (const file of scripts) {
      const text = repo.read(file);
      if (!text) continue;
      text.split("\n").forEach((line, i) => {
        const hit = SKIP_FLAGS.find((f) => f.flag.test(line) && (!f.agent || f.agent.test(line)));
        if (hit) found.push({ file, line: i + 1, key: "skip_flag", params: { flag: hit.flag.exec(line)![0].trim() } });
      });
    }

    if (found.length) return warn(msg("found", { count: found.length }), capped(found));
    return pass(msg("none", { count: configs.length + scripts.length }));
  },
});
