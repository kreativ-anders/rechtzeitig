// What the repository scan could not see: package files without a parser, private package sources,
// submodules. Only names them; nothing here contacts a registry or a remote.

import { loadYaml } from "../data.ts";
import { hostIn } from "../text.ts";
import type { RepoCoverage } from "../sdk.ts";

const ECOSYSTEMS = loadYaml<{ unsupported: Record<string, string>; public_registries: string[] }>("data/ecosystems.yml");
const UNSUPPORTED = Object.entries(ECOSYSTEMS.unsupported).map(([name, ecosystem]) => ({ re: new RegExp(name), ecosystem }));

/** Package files of ecosystems without a parser (data/ecosystems.yml `unsupported`). */
export function unsupportedFiles(files: string[]): RepoCoverage["unsupported"] {
  return files.flatMap((file) => {
    const name = file.split("/").pop() ?? "";
    const hit = UNSUPPORTED.find((u) => u.re.test(name));
    return hit ? [{ file, ecosystem: hit.ecosystem }] : [];
  });
}

type Source = RepoCoverage["private"][number];

/** Host of a URL without user, password, path or query, so a token in the URL never reaches the report. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url.replace(/^git\+/, "")).hostname || undefined;
  } catch {
    return undefined;
  }
}
const isPublic = (host: string) => ECOSYSTEMS.public_registries.some((r) => hostIn(host, r));
/** A git source as host and path, without credentials: "github.com/org/repo". */
function gitSource(spec: string): string {
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+?)(?:\.git)?(?:#.*)?$/.exec(spec.replace(/^git\+/, ""));
  if (scp && !/^(https?|ssh|git|file)$/.test(scp[1])) return `${scp[1]}/${scp[2]}`;
  try {
    const u = new URL(spec.replace(/^git\+/, ""));
    return `${u.hostname}${u.pathname.replace(/\.git$/, "")}`;
  } catch {
    return spec.replace(/[#?].*$/, "").replace(/^[^@/]*@/, "");
  }
}

const NPMRC_REGISTRY = /^\s*(?:@[\w.-]+:)?registry\s*=\s*(\S+)/gm;
const YARNRC_REGISTRY = /npmRegistryServer:\s*["']?([^"'\s]+)/g;
// "resolved": "https://..." (package-lock.json), resolved "https://..." (yarn.lock), tarball: https://... (pnpm-lock.yaml)
const RESOLVED = /(?:"resolved"\s*:\s*|^\s+resolved\s+|tarball:\s*)"?([^"\s,}]+)/gm;
const GIT_URL = /^(git\+|git:|github:|gitlab:|bitbucket:|ssh:)|\.git(#|$)/;
const PIP_INDEX = /^\s*(?:-i|--index-url|--extra-index-url)[\s=]+(\S+)/gm;
const PIP_GIT = /(?:^|\s|@\s*)(git\+\S+)/gm;
const GO_REPLACE = /^\s*(?:replace\s+)?(\S+)(?:\s+v\S+)?\s+=>\s+(\S+)/;

/** Package sources outside the public registries, one per file and source. */
export function privateSources(files: string[], read: (path: string) => string | undefined): Source[] {
  const found = new Map<string, Source>();
  const add = (file: string, kind: Source["kind"], source: string | undefined) => {
    if (source) found.set(`${file}\n${kind}\n${source}`, { file, kind, source });
  };
  const registry = (file: string, url: string) => {
    const host = hostOf(url);
    if (host && !isPublic(host)) add(file, "registry", host);
  };
  for (const file of files) {
    const name = file.split("/").pop() ?? "";
    const text = () => read(file) ?? "";
    if (name === ".npmrc") for (const m of text().matchAll(NPMRC_REGISTRY)) registry(file, m[1]);
    else if (name === ".yarnrc.yml") for (const m of text().matchAll(YARNRC_REGISTRY)) registry(file, m[1]);
    else if (name === "package-lock.json" || name === "yarn.lock" || name === "pnpm-lock.yaml") {
      for (const m of text().matchAll(RESOLVED)) {
        if (GIT_URL.test(m[1])) add(file, "git", gitSource(m[1]));
        else if (/^https?:/.test(m[1])) registry(file, m[1]);
      }
    } else if (/^requirements.*\.txt$/.test(name)) {
      const t = text();
      for (const m of t.matchAll(PIP_INDEX)) registry(file, m[1]);
      for (const m of t.matchAll(PIP_GIT)) add(file, "git", gitSource(m[1]));
    } else if (name === "go.mod") {
      goReplaces(text()).forEach((r) => add(file, "replace", r));
    }
  }
  return [...found.values()];
}

/** `replace` directives of a go.mod, single lines and blocks, as "old => new". */
function goReplaces(mod: string): string[] {
  const lines = [
    ...mod.split(/^replace[ \t]*\(/m).slice(1).flatMap((b) => b.split("\n)")[0].split("\n")),
    ...[...mod.matchAll(/^replace[ \t]+[^(\n].*$/gm)].map((m) => m[0]),
  ];
  return lines.flatMap((line) => {
    const m = GO_REPLACE.exec(line.replace(/\/\/.*$/, ""));
    return m ? [`${m[1]} => ${m[2]}`] : [];
  });
}

/** Submodule paths named in the .gitmodules files of the scanned files, relative to the repository. */
export function gitmodulePaths(files: string[], read: (path: string) => string | undefined): string[] {
  return files.filter((f) => f === ".gitmodules" || f.endsWith("/.gitmodules")).flatMap((file) => {
    const dir = file.slice(0, -".gitmodules".length);
    return [...(read(file) ?? "").matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map((m) => dir + m[1].replace(/\/$/, ""));
  });
}
