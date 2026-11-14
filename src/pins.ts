// Action pins (`uses: owner/action@<sha> # vX.Y.Z`) in action.yml, .github/workflows/ and examples/workflows/.
// Dependabot moves the pins in action.yml and .github/workflows/ only. `npm run sync-pins` copies them into
// examples/workflows/; src/pinning.test.ts fails while they differ. The rechtzeitig pin in the example is
// moved by the release workflow and has no source here, so it is left alone.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const USES = /^(\s*-?\s*uses:\s*["']?)([^"'\s#@]+)(?:@([^"'\s#]+))?(["']?)(?:(\s*#\s*)(\S+))?/gm;
const dir = (d: string) => readdirSync(d).filter((f) => /\.ya?ml$/.test(f)).map((f) => `${d}/${f}`);

/** Files whose pins Dependabot keeps current, and the examples that copy them. */
export const SOURCES = () => ["action.yml", ...dir(".github/workflows")];
export const EXAMPLES = () => dir("examples/workflows");

export interface Use {
  file: string;
  action: string;
  ref?: string;
  version?: string;
}

/** Every `uses:` of another repository in `files`. Local actions (`./`) are left out. */
export const usesIn = (files: string[]): Use[] =>
  files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(USES)]
      .filter((m) => !m[2].startsWith("./"))
      .map((m) => ({ file, action: m[2], ref: m[3], version: m[6] })),
  );

/** Sets each pin in the examples to the pin of the same action in the sources. Returns the files it changed. */
export function syncPins(): string[] {
  const pins = new Map<string, string>();
  for (const u of usesIn(SOURCES())) {
    const pin = `${u.ref} # ${u.version}`;
    if (pins.has(u.action) && pins.get(u.action) !== pin) throw new Error(`${u.action} has two pins in the sources: ${pins.get(u.action)} and ${pin}`);
    pins.set(u.action, pin);
  }
  const changed: string[] = [];
  for (const file of EXAMPLES()) {
    const before = readFileSync(file, "utf8");
    const after = before.replace(USES, (line, head: string, action: string, ref: string, quote: string, hash?: string, version?: string) => {
      const pin = pins.get(action);
      if (!pin) return line;
      const [sha, , tag] = pin.split(" ");
      return `${head}${action}@${sha}${quote}${hash ?? " # "}${tag}`;
    });
    if (after !== before) {
      writeFileSync(file, after);
      changed.push(file);
    }
  }
  return changed;
}

if (import.meta.main) {
  const changed = syncPins();
  console.log(changed.length ? `Pins updated in ${changed.join(", ")}.` : "Pins in examples/workflows/ already match.");
}
