import {
  DECLARING,
  FIXTURES,
  capped,
  declaredDependencies,
  defineRepoCheck,
  lockfilesFor,
  loadYaml,
  msg,
  ownName,
  pass,
  pypiName,
  skip,
  warn,
  type Declared,
  type Ecosystem,
  type Finding,
} from "../../../src/sdk.ts";

const DATA = loadYaml<{
  popular: Partial<Record<Ecosystem, string[]>>;
  known: Partial<Record<Ecosystem, string[]>>;
  managers: Record<string, Record<string, string[]>>;
}>("data/packages.yml");
const MANAGER_LOCKS = new Set(Object.values(DATA.managers).flatMap((ms) => Object.values(ms).flat()));
const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const LIMITS = loadYaml<{ "security/hallucinated-packages": { min_length: number; max_distance: number } }>("data/thresholds.yml")[
  "security/hallucinated-packages"
];

const norm = (ecosystem: Ecosystem, name: string) => (ecosystem === "pypi" ? pypiName(name) : name);
const POPULAR = new Map<Ecosystem, string[]>(Object.entries(DATA.popular).map(([e, l]) => [e as Ecosystem, l!.map((n) => norm(e as Ecosystem, n))]));
const KNOWN = new Map<Ecosystem, Set<string>>(Object.entries(DATA.known).map(([e, l]) => [e as Ecosystem, new Set(l!.map((n) => norm(e as Ecosystem, n)))]));

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps), stopping early above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** The popular package a name looks like a typo of, or an unscoped copy of a scoped one (supabase-js for @supabase/supabase-js). */
function lookalike(ecosystem: Ecosystem, name: string): { of: string; how: "typo" | "scope" } | undefined {
  const popular = POPULAR.get(ecosystem);
  if (!popular || popular.includes(name) || KNOWN.get(ecosystem)?.has(name) || name.startsWith("@types/")) return undefined;
  if (ecosystem === "npm" && !name.startsWith("@")) {
    const scoped = popular.find((p) => {
      const m = /^@([^/]+)\/(.+)$/.exec(p);
      return m && m[2] === name && name.includes(m[1].replace(/-js$/, ""));
    });
    if (scoped) return { of: scoped, how: "scope" };
  }
  if (name.length < LIMITS.min_length) return undefined;
  const typo = popular.find((p) => distance(name, p, LIMITS.max_distance) <= LIMITS.max_distance);
  return typo ? { of: typo, how: "typo" } : undefined;
}

export default defineRepoCheck({
  run(repo) {
    const manifests = repo.files.filter((f) => !FIXTURES.test(f) && (DECLARING as readonly string[]).includes(f.split("/").pop() ?? ""));
    const declared = manifests.flatMap((m) => declaredDependencies(repo, m)).filter((d) => d.kind === "registry");
    if (!declared.length) return skip(msg("no_dependencies"));
    // Packages of this repository (workspace members) are linked, never in a lockfile's package list.
    const own = new Set(repo.files.filter((f) => manifests.includes(f)).map((m) => ownName(repo, m)).filter(Boolean) as string[]);
    const findings: Finding[] = [];
    let compared = 0;
    const parsed = new Set(repo.coverage.lockfiles.parsed);

    const byManifest = new Map<string, Declared[]>();
    for (const d of declared) byManifest.set(d.manifest, [...(byManifest.get(d.manifest) ?? []), d]);
    for (const [manifest, deps] of byManifest) {
      const locks = lockfilesFor(repo, manifest);
      // Another manager's lockfile next to it that the scan cannot read (bun.lock): that one may be the real lock.
      const unread = repo.files.some((f) => dirOf(f) === dirOf(manifest) && MANAGER_LOCKS.has(f.split("/").pop() ?? "") && !parsed.has(f));
      if (locks.length && !unread) {
        compared++;
        const locked = new Set(repo.components.filter((c) => locks.includes(c.source)).map((c) => norm(c.ecosystem, c.name)));
        for (const d of deps) {
          if (own.has(d.name) || locked.has(d.name)) continue;
          findings.push({ file: manifest, line: d.line, key: "not_locked", params: { name: d.name, lockfile: locks[0] } });
        }
      }
      for (const d of deps) {
        const like = lookalike(d.ecosystem, d.name);
        if (like && !own.has(d.name)) findings.push({ file: manifest, line: d.line, key: like.how, params: { name: d.name, of: like.of } });
      }
    }
    // Pinned requirements files are both manifest and lock: only the name check applies.
    for (const c of repo.components.filter((c) => /(^|\/)requirements[^/]*\.txt$/.test(c.source) && !FIXTURES.test(c.source))) {
      const name = pypiName(c.name);
      const like = lookalike("pypi", name);
      if (like) findings.push({ file: c.source, key: like.how, params: { name, of: like.of } });
    }

    if (findings.length) return warn(msg("found", { count: findings.length }), capped(findings));
    return pass(msg("none", { count: declared.length, lockfiles: compared }));
  },
});
