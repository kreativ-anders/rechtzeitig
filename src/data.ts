// Loads the YAML files that ship with rechtzeitig (data/, lang/, rule.yml).
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const ROOT = new URL("../", import.meta.url);

/** Parses a YAML file. `path` is relative to the repository root or a file URL; errors name the file. */
export function loadYaml<T>(path: string | URL): T {
  const url = typeof path === "string" ? new URL(path, ROOT) : path;
  try {
    return parse(readFileSync(url, "utf8")) as T;
  } catch (e) {
    throw new Error(`${url.pathname}: ${(e as Error).message}`);
  }
}
