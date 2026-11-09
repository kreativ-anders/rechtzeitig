import {
  FIXTURES,
  capped,
  declaredDependencies,
  defineRepoCheck,
  lockfilesFor,
  loadYaml,
  msg,
  pass,
  satisfies,
  skip,
  warn,
  type Finding,
} from "../../../src/sdk.ts";

const DATA = loadYaml<{ managers: Record<string, Record<string, string[]>> }>("data/packages.yml");
const MANAGER_OF = new Map<string, { family: string; manager: string }>(
  Object.entries(DATA.managers).flatMap(([family, ms]) => Object.entries(ms).flatMap(([manager, files]) => files.map((f) => [f, { family, manager }] as const))),
);

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path: string) => path.split("/").pop() ?? "";
const inDir = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

type PnpmRef = string | { specifier?: string; version?: string };
interface PnpmImporter { specifiers?: Record<string, string>; dependencies?: Record<string, PnpmRef>; devDependencies?: Record<string, PnpmRef>; optionalDependencies?: Record<string, PnpmRef> }

/** Specifier pnpm recorded for a dependency of the importer at `rel`, in lockfile v5 to v9. */
function pnpmSpecifier(lock: (PnpmImporter & { importers?: Record<string, PnpmImporter> }) | undefined, rel: string, name: string): string | undefined {
  const importer = lock?.importers ? lock.importers[rel || "."] : rel ? undefined : lock;
  if (!importer) return undefined;
  if (importer.specifiers) return importer.specifiers[name];
  for (const group of [importer.dependencies, importer.devDependencies, importer.optionalDependencies]) {
    const ref = group?.[name];
    if (ref && typeof ref === "object" && typeof ref.specifier === "string") return ref.specifier;
  }
  return undefined;
}

/** Descriptors in yarn.lock headers ("lodash@^4.17.21", "lodash@npm:^4.17.21"). */
function yarnDescriptors(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    if (!/^\S.*:$/.test(line) || line.startsWith("__metadata")) continue;
    for (const d of line.slice(0, -1).split(",")) out.add(d.trim().replace(/^"|"$/g, ""));
  }
  return out;
}

export default defineRepoCheck({
  run(repo) {
    const findings: Finding[] = [];
    const files = repo.files.filter((f) => !FIXTURES.test(f));

    // Lockfiles of two package managers in one folder: who installs decides what gets installed.
    const byDir = new Map<string, Map<string, Set<string>>>();
    for (const f of files) {
      const m = MANAGER_OF.get(baseOf(f));
      if (!m) continue;
      const families = byDir.get(dirOf(f)) ?? new Map<string, Set<string>>();
      families.set(m.family, (families.get(m.family) ?? new Set()).add(m.manager));
      byDir.set(dirOf(f), families);
    }
    for (const [dir, families] of byDir) {
      for (const managers of families.values()) {
        if (managers.size < 2) continue;
        const names = files.filter((f) => dirOf(f) === dir && MANAGER_OF.has(baseOf(f)) && managers.has(MANAGER_OF.get(baseOf(f))!.manager));
        findings.push({ file: names[0], key: "managers", params: { managers: [...managers].sort().join(", "), files: names.map(baseOf).join(", ") } });
      }
    }

    const manifests = files.filter((f) => ["package.json", "Cargo.toml"].includes(baseOf(f)));
    if (!byDir.size && !manifests.length) return skip(msg("no_lockfiles"));
    let compared = 0;
    const parsed = new Set(repo.coverage.lockfiles.parsed);
    for (const manifest of manifests) {
      const dir = dirOf(manifest);
      // "packageManager": "pnpm@9.1.0" while only another manager's lockfile is there.
      if (baseOf(manifest) === "package.json") {
        let declared: unknown;
        try {
          declared = (JSON.parse(repo.read(manifest) ?? "{}") as { packageManager?: unknown }).packageManager;
        } catch {
          // not valid JSON: nothing to compare
        }
        const wanted = typeof declared === "string" ? declared.split("@")[0] : undefined;
        const present = files.filter((f) => dirOf(f) === dir && MANAGER_OF.get(baseOf(f))?.family === "npm");
        if (wanted && present.length && !present.some((f) => MANAGER_OF.get(baseOf(f))!.manager === wanted)) {
          findings.push({ file: manifest, key: "package_manager", params: { manager: wanted, files: present.map(baseOf).join(", ") } });
        }
      }

      const locks = lockfilesFor(repo, manifest);
      // Another manager's lockfile next to it that the scan cannot read (bun.lock) may be the one in use.
      if (!locks.length || files.some((f) => dirOf(f) === dir && MANAGER_OF.has(baseOf(f)) && !parsed.has(f))) continue;
      compared++;
      const deps = declaredDependencies(repo, manifest).filter((d) => d.kind === "registry" && d.spec);
      for (const lock of locks) {
        const lockDir = dirOf(lock);
        const rel = lockDir ? dir.slice(lockDir.length + 1) : dir;
        const versions = new Map<string, string[]>();
        for (const c of repo.components.filter((c) => c.source === lock)) versions.set(c.name, [...(versions.get(c.name) ?? []), c.version]);
        const pnpm = baseOf(lock) === "pnpm-lock.yaml" ? repo.yaml<PnpmImporter & { importers?: Record<string, PnpmImporter> }>(lock) : undefined;
        const yarn = baseOf(lock) === "yarn.lock" ? yarnDescriptors(repo.read(lock) ?? "") : undefined;
        for (const d of deps) {
          const locked = versions.get(d.name);
          if (!locked) continue; // not locked at all: security/hallucinated-packages reports it
          let stale = false;
          if (pnpm) {
            const recorded = pnpmSpecifier(pnpm, rel, d.name);
            stale = recorded !== undefined && recorded !== d.spec;
          } else if (yarn) {
            stale = !yarn.has(`${d.name}@${d.spec}`) && !yarn.has(`${d.name}@npm:${d.spec}`);
          } else {
            const results = locked.map((v) => satisfies(v, d.spec, d.ecosystem === "cargo" ? "cargo" : "npm"));
            stale = results.every((r) => r === false);
          }
          if (stale) findings.push({ file: manifest, line: d.line, key: "stale", params: { name: d.name, spec: d.spec, locked: locked.join(", "), lockfile: baseOf(lock) } });
        }
      }
    }

    if (findings.length) return warn(msg("found", { count: findings.length }), capped(findings));
    return pass(msg("none", { count: compared }));
  },
});
