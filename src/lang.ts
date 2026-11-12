import { readdirSync } from "node:fs";
import { loadYaml } from "./data.ts";
import { errorMessage } from "./text.ts";
import type { Link } from "./sdk.ts";

const DIR = new URL("../lang/", import.meta.url);

export interface Language {
  codes: string[];
  locale: string;
  links: Record<string, RegExp[]>;
  text: Record<string, RegExp[]>;
}

export function availableLanguages(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".yml")).map((f) => f.slice(0, -4)).sort();
}

/** "de" → ["de"], "all" → every file in lang/. */
export function resolveLanguages(choice: string): string[] {
  const available = availableLanguages();
  const codes = choice === "all" ? available : choice.split(",").map((c) => c.trim()).filter(Boolean);
  const unknown = codes.filter((c) => !available.includes(c));
  if (unknown.length || !codes.length) {
    throw new Error(`Unknown language "${choice}". Available: ${available.join(", ")}, all`);
  }
  return codes;
}

/** Loads and merges language packs. Patterns of all chosen languages are combined per concept. */
export function loadLanguages(codes: string[]): Language {
  const merged: Language = { codes, locale: "", links: {}, text: {} };
  for (const code of codes) {
    const file = new URL(`${code}.yml`, DIR);
    const pack = loadYaml<{ locale: string; links?: Record<string, string[]>; text?: Record<string, string[]> }>(file);
    merged.locale ||= pack.locale;
    for (const group of ["links", "text"] as const) {
      for (const [concept, patterns] of Object.entries(pack[group] ?? {})) {
        const compiled = (patterns as string[]).map((p) => {
          try {
            return new RegExp(p, "i");
          } catch (e) {
            throw new Error(`lang/${code}.yml ${group}.${concept}: invalid pattern ${p} (${errorMessage(e)})`);
          }
        });
        (merged[group][concept] ??= []).push(...compiled);
      }
    }
  }
  return merged;
}

export function patternsFor(lang: Language, group: "links" | "text", concept: string): RegExp[] {
  const patterns = lang[group][concept];
  if (!patterns) throw new Error(`Unknown concept "${concept}" in lang/*.yml ${group}`);
  return patterns;
}

export function matchLinks(lang: Language, concept: string, links: Link[]): Link[] {
  const patterns = patternsFor(lang, "links", concept);
  return links.filter((link) => patterns.some((re) => re.test(link.label)));
}

let allLinks: Language["links"] | undefined;
/** Link words of every language in lang/, cached once. Used only for the legal-page concepts (LEGAL_CONCEPTS in src/sdk.ts). */
export function legalLinkPatterns(): Language["links"] {
  allLinks ??= loadLanguages(availableLanguages()).links;
  return allLinks;
}
