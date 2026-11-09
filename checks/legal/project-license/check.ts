import {
  LICENSE_FILE, defineRepoCheck, detectLicenseText, hasCommonsClause, inFamily, info, licenseIds, loadYaml, msg, normalizeLicenseText, pass,
  licenseChanges, readLicense, spdxStatus, warn, type Finding, type RepoContext,
} from "../../../src/sdk.ts";

const { max_changed_pairs: MAX_CHANGED } = loadYaml<Record<string, { max_changed_pairs: number }>>("data/thresholds.yml")["legal/project-license"];
const TEXTS = loadYaml<Record<string, string>>("data/license-texts.yml");
const REFERENCE = Object.fromEntries(Object.entries(TEXTS).map(([id, text]) => [id, normalizeLicenseText(text)]));

/** The `license` field of a TOML section, such as [package] in Cargo.toml. */
function tomlLicense(text: string, section: string): string | undefined {
  const block = text.split(/^\[/m).find((b) => b.startsWith(`${section}]`));
  return block && /^license\s*=\s*"([^"\n]*)"/m.exec(block)?.[1];
}

/** License fields of the manifests in the repository root. */
function manifestLicenses(repo: RepoContext): Array<{ file: string; raw: string }> {
  const json = (file: string) => repo.yaml<{ license?: unknown; licenses?: Array<{ type?: string }> }>(file);
  const value = (v: unknown): string | undefined =>
    typeof v === "string" ? v : Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" OR ") || undefined : (v as { type?: string } | undefined)?.type;
  const found: Array<{ file: string; raw: string | undefined }> = [
    { file: "package.json", raw: value(json("package.json")?.license) ?? value(json("package.json")?.licenses?.map((l) => l?.type)) },
    { file: "composer.json", raw: value(json("composer.json")?.license) },
    { file: "Cargo.toml", raw: tomlLicense(repo.read("Cargo.toml") ?? "", "package") },
    { file: "pyproject.toml", raw: tomlLicense(repo.read("pyproject.toml") ?? "", "project") ?? tomlLicense(repo.read("pyproject.toml") ?? "", "tool.poetry") },
  ];
  return found.filter((m): m is { file: string; raw: string } => !!m.raw?.trim());
}

/** Comparable form of an id: GPL-3.0-only, GPL-3.0-or-later, GPL-3.0+ and GPL-3.0 are one license here. */
const base = (id: string) => id.toLowerCase().replace(/\+$/, "").replace(/-(only|or-later)$/, "");

export default defineRepoCheck({
  run(repo) {
    const manifests = manifestLicenses(repo);
    const files = repo.files.filter((f) => LICENSE_FILE.test(f));
    if (!manifests.length && !files.length) return info(msg("none"));

    const warnings: Finding[] = [];
    const notes: Finding[] = [];
    const declared: string[] = [];
    for (const { file, raw } of manifests) {
      const license = readLicense(raw);
      if (license.status === "unlicensed" || license.status === "see_file") continue;
      if (license.status !== "ok") {
        warnings.push({ file, key: "not_spdx", params: { license: raw } });
        continue;
      }
      for (const id of licenseIds(raw)) {
        const status = spdxStatus(id);
        if (status === "unknown") warnings.push({ file, key: "unknown_id", params: { id } });
        if (status === "deprecated") notes.push({ file, key: "deprecated", params: { id } });
      }
      declared.push(...licenseIds(raw));
    }
    const sets = manifests.map((m) => ({ ...m, ids: [...new Set(licenseIds(m.raw).map(base))].sort().join(" ") })).filter((m) => m.ids);
    const other = sets.find((m) => m.ids !== sets[0].ids);
    if (other) warnings.push({ file: other.file, key: "manifests_differ", params: { a: `${sets[0].file}: ${sets[0].raw}`, b: `${other.file}: ${other.raw}` } });

    for (const file of files) {
      const text = repo.read(file);
      if (text === undefined) continue;
      const reuse = /^LICENSES\/(.+)\.\w+$/i.exec(file)?.[1];
      const family = reuse && spdxStatus(reuse) !== "unknown" ? reuse : detectLicenseText(text);
      if (!family) {
        if (!reuse) notes.push({ file, key: "unrecognized" });
        continue;
      }
      // LGPL builds on the GPL: COPYING with the GPL text next to COPYING.LESSER is the usual layout.
      const fits = (id: string) => inFamily(id, family) || (/^GPL-3\.0/.test(family) && /^LGPL-3\.0/i.test(id)) || base(id) === base(family);
      if (declared.length && !declared.some(fits)) warnings.push({ file, key: "file_differs", params: { detected: family, declared: [...new Set(declared)].join(", ") } });
      if (hasCommonsClause(text) && /^A?GPL-/.test(family)) warnings.push({ file, key: "commons_clause", params: { license: family } });
      const reference = REFERENCE[family];
      if (reference && !reuse) {
        const { added, removed } = licenseChanges(normalizeLicenseText(text), reference);
        if (added - removed >= MAX_CHANGED) notes.push({ file, key: "added_text", params: { license: family, count: added - removed } });
        else if (removed - added >= MAX_CHANGED) notes.push({ file, key: "removed_text", params: { license: family, count: removed - added } });
      }
    }

    const shown = manifests.length ? manifests.map((m) => `${m.file}: ${m.raw}`).join(", ") : files.join(", ");
    if (warnings.length) return warn(msg("problems", { count: warnings.length }), [...warnings, ...notes]);
    if (notes.length) return info(msg("notes", { count: notes.length, license: shown }), notes);
    return pass(msg("declared", { license: shown }));
  },
});
