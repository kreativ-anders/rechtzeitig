// Just enough semver to tell whether a locked version meets a manifest's range, for npm and Cargo.
// Anything it cannot parse gives undefined, so a check stays silent instead of guessing.
// Pre-release rules are not applied: a pre-release counts like its position in the order.

type Version = [number, number, number, string];
type Comparator = { op: ">=" | ">" | "<" | "<=" | "="; v: Version };

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL = /^(\^|~>?|>=|<=|>|<|=)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(s: string): Version | undefined {
  const m = VERSION.exec(s.trim());
  return m ? [+m[1], +m[2], +m[3], m[4] ?? ""] : undefined;
}

function comparePre(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1; // a release is above its pre-releases
  if (!b) return -1;
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb && +pa[i] !== +pb[i]) return +pa[i] - +pb[i];
    if (na !== nb) return na ? -1 : 1;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || comparePre(a[3], b[3]);
}

const isX = (p: string | undefined) => p === undefined || /^[xX*]$/.test(p);

/** One comparator token (^1.2, ~1, >=2.0.0, 1.x) as plain comparators; undefined if it is not one. */
function desugar(token: string, bareIsCaret: boolean): Comparator[] | undefined {
  const m = PARTIAL.exec(token);
  if (!m) return undefined;
  let op = m[1] ?? (bareIsCaret ? "^" : "=");
  if (op === "~>") op = "~";
  if (isX(m[2])) return op === "<" || op === ">" ? [{ op: "<", v: [0, 0, 0, "0"] }] : [];
  const major = +m[2];
  const minor = isX(m[3]) ? undefined : +m[3]!;
  const patch = isX(m[4]) ? undefined : +m[4]!;
  const pre = m[5] ?? "";
  const lo: Version = [major, minor ?? 0, patch ?? 0, pre];
  const next = (v: Version): Version => [v[0], v[1], v[2], "0"]; // the lowest pre-release of v, so v itself is excluded
  const upMajor = next([major + 1, 0, 0, ""]);
  const upMinor = next([major, (minor ?? 0) + 1, 0, ""]);
  switch (op) {
    case "^":
      if (major > 0 || minor === undefined) return [{ op: ">=", v: lo }, { op: "<", v: upMajor }];
      if (minor > 0 || patch === undefined) return [{ op: ">=", v: lo }, { op: "<", v: upMinor }];
      return [{ op: ">=", v: lo }, { op: "<", v: next([0, 0, patch + 1, ""]) }];
    case "~":
      return [{ op: ">=", v: lo }, { op: "<", v: minor === undefined ? upMajor : upMinor }];
    case "=":
      if (minor === undefined) return [{ op: ">=", v: lo }, { op: "<", v: upMajor }];
      if (patch === undefined) return [{ op: ">=", v: lo }, { op: "<", v: upMinor }];
      return [{ op: "=", v: lo }];
    case ">":
      if (minor === undefined) return [{ op: ">=", v: upMajor }];
      if (patch === undefined) return [{ op: ">=", v: upMinor }];
      return [{ op: ">", v: lo }];
    case "<=":
      if (minor === undefined) return [{ op: "<", v: upMajor }];
      if (patch === undefined) return [{ op: "<", v: upMinor }];
      return [{ op: "<=", v: lo }];
    default:
      return [{ op: op as ">=" | "<", v: lo }];
  }
}

const holds = (v: Version, c: Comparator) => {
  const d = compare(v, c.v);
  return c.op === ">=" ? d >= 0 : c.op === ">" ? d > 0 : c.op === "<" ? d < 0 : c.op === "<=" ? d <= 0 : d === 0;
};

/**
 * Whether `version` meets `range`. npm: "||", spaces, hyphen ranges, ^ ~ x. Cargo: commas, and a bare
 * version means ^. undefined when either cannot be parsed (tags, URLs, workspace:, catalog:).
 */
export function satisfies(version: string, range: string, flavor: "npm" | "cargo"): boolean | undefined {
  const v = parseVersion(version);
  if (!v) return undefined;
  const r = range.trim();
  if (!r || r === "*") return true;
  const alternatives = flavor === "npm" ? r.split("||") : [r];
  let parsed = false;
  for (const alt of alternatives) {
    const a = alt.trim();
    if (!a || a === "*") return true;
    let set: Comparator[] = [];
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(a);
    if (flavor === "npm" && hyphen) {
      const lo = desugar(`>=${hyphen[1]}`, false);
      const hi = desugar(`<=${hyphen[2]}`, false);
      if (!lo || !hi) return undefined;
      set = [...lo, ...hi];
    } else {
      const tokens = a.replace(/([<>=~^]+)\s+/g, "$1").split(flavor === "cargo" ? /\s*,\s*/ : /\s+/);
      for (const t of tokens) {
        const c = desugar(t, flavor === "cargo");
        if (!c) return undefined;
        set.push(...c);
      }
    }
    parsed = true;
    if (set.every((c) => holds(v, c))) return true;
  }
  return parsed ? false : undefined;
}
