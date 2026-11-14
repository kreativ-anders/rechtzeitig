import {
  DECLARING,
  FIXTURES,
  capped,
  declaredDependencies,
  defineRepoCheck,
  fail,
  info,
  lineAt,
  loadYaml,
  msg,
  pass,
  pipGitRef,
  skip,
  unreadFiles,
  warn,
  type Component,
  type Finding,
} from "../../../src/sdk.ts";

interface Rule { key: string; level: "fail" | "warn"; pattern: string }
const DATA = loadYaml<{
  integrity_in: string[];
  git: string;
  commit: string;
  commit_in_url: string;
  http: string;
  pip_git: string;
  configs: Array<{ files: string; pip_git?: boolean; rules: Rule[] }>;
}>("data/install-sources.yml");
const GIT = new RegExp(DATA.git);
const COMMIT = new RegExp(DATA.commit);
const COMMIT_IN_URL = new RegExp(DATA.commit_in_url);
const HTTP = new RegExp(DATA.http, "i");
const PIP_GIT = new RegExp(DATA.pip_git);
const CONFIGS = DATA.configs.map((c) => ({ files: new RegExp(c.files), pip: !!c.pip_git, rules: c.rules.map((r) => ({ ...r, re: new RegExp(r.pattern) })) }));
const FAILING = new Set(DATA.configs.flatMap((c) => c.rules.filter((r) => r.level === "fail").map((r) => r.key)).concat("http"));

const baseOf = (path: string) => path.split("/").pop() ?? "";
/** Host of a URL, never user, password, path or query: a token in the URL stays out of the report. */
function hostOf(url: string): string {
  try {
    return new URL(url.replace(/^[a-z]+\+/i, "")).hostname || url.replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/i, "").split(/[/:?#]/)[0];
  } catch {
    return url.replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/i, "").split(/[/:?#]/)[0];
  }
}
/** A git repository as host and path, without credentials, ref or fragment: "github.com/org/repo". */
const repoOf = (url: string) => url.replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/i, "").replace(/#.*$/, "").replace(/@[^/]*$/, "").replace(/\.git$/, "");
/** A git ref that names a full commit; npm's "commit::path:sub" counts when one part is a commit. */
const pinned = (ref: string) => ref.split("::").some((part) => COMMIT.test(part));

export default defineRepoCheck({
  run(repo) {
    const own = (f: string) => !FIXTURES.test(f);
    const findings: Finding[] = [];

    // Lockfiles: where each package is downloaded from and whether the download is checked.
    const lockfiles = repo.lockfiles.filter(own);
    const bySource = new Map<string, Component[]>();
    for (const c of repo.components) if (c.resolved !== undefined && own(c.source)) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c]);
    for (const [lock, components] of bySource) {
      const text = repo.read(lock) ?? "";
      const at = (needle: string) => {
        const i = text.indexOf(needle);
        return i >= 0 ? lineAt(text, i) : undefined;
      };
      const hashed = DATA.integrity_in.includes(baseOf(lock));
      for (const c of components) {
        const url = c.resolved!;
        const params = { name: c.name, version: c.version };
        // yarn Berry writes "name@npm:1.2.3"; the bare spec would also match dependency lines of other packages.
        const line = at(url.startsWith("npm:") ? `${c.name}@${url}` : url);
        if (HTTP.test(url)) findings.push({ file: lock, line, key: "http", params: { ...params, host: hostOf(url) } });
        else if (GIT.test(url)) {
          if (!COMMIT_IN_URL.test(url)) findings.push({ file: lock, line, key: "git_lockfile", params });
        } else if (hashed && !c.integrity && (/^https:\/\//i.test(url) || url.startsWith("npm:"))) {
          findings.push({ file: lock, line, key: "no_integrity", params });
        }
      }
    }

    // Manifests: git dependencies that follow a branch or tag.
    const manifests = repo.files.filter((f) => own(f) && (DECLARING as readonly string[]).includes(baseOf(f)));
    for (const manifest of manifests) {
      for (const d of declaredDependencies(repo, manifest)) {
        if (d.kind !== "git" || pinned(d.ref ?? "")) continue;
        findings.push({ file: manifest, line: d.line, key: d.ref ? "git_ref" : "git_no_ref", params: { name: d.name, ref: d.ref ?? "" } });
      }
    }

    // Package manager configs and requirements files, line by line.
    const configs = repo.files.filter((f) => own(f) && CONFIGS.some((c) => c.files.test(f)));
    for (const file of configs) {
      const matching = CONFIGS.filter((c) => c.files.test(file));
      const rules = matching.flatMap((c) => c.rules);
      const requirements = matching.some((c) => c.pip);
      (repo.read(file) ?? "").split("\n").forEach((line, i) => {
        if (/^\s*[#;]/.test(line)) return;
        for (const rule of rules) {
          const m = rule.re.exec(line);
          if (!m) continue;
          findings.push({ file, line: i + 1, key: rule.key, params: m[1] ? { host: hostOf(m[1]) } : {} });
          return;
        }
        const git = requirements && PIP_GIT.exec(line)?.[1];
        if (git) {
          const ref = pipGitRef(git);
          if (!pinned(ref)) findings.push({ file, line: i + 1, key: ref ? "git_ref" : "git_no_ref", params: { name: repoOf(git), ref } });
        }
      });
    }

    const checked = new Set([...lockfiles, ...manifests, ...configs]).size;
    if (findings.length) {
      const failing = findings.filter((f) => FAILING.has(f.key ?? "")).length;
      const message = msg("found", { count: findings.length });
      return failing ? fail(message, capped(findings)) : warn(message, capped(findings));
    }
    // A lockfile or config that could not be read was never looked at: no pass (#85).
    const gaps = [...repo.coverage.lockfiles.failed.map((f) => f.file).filter(own), ...unreadFiles(repo, configs)];
    if (gaps.length) return info(msg("gaps", { count: gaps.length }), capped(gaps.map((file): Finding => ({ file, key: "unread" }))));
    if (!checked) return skip(msg("nothing"));
    return pass(msg("none", { count: checked }));
  },
});
