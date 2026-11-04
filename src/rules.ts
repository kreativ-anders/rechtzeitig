// Rule metadata: checks/<category>/<name>/rule.yml. Detection lives in check.ts next to it.
// Legal and wording updates are data updates here, never engine changes.

import { loadYaml } from "./data.ts";
import { DAY } from "./deadline.ts";

export const LANGUAGES = ["de", "en"] as const;
export type UiLanguage = (typeof LANGUAGES)[number];
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** SEC security, LEG-DE German law, LEG-EU EU law, A11Y accessibility, PRC prices, SUS sustainability. */
const ID = /^(SEC|LEG-DE|LEG-EU|A11Y|PRC|SUS)-[A-Z0-9]+-\d{3}$/;
/** A rule whose review is older than this fails the tests, so legal texts get looked at again. */
const REVIEW_DAYS = 365;

/** Domains a source may come from (data/source-domains.yml): primary sources only. */
const SOURCE_DOMAINS = Object.values(loadYaml<Record<string, string[]>>("data/source-domains.yml")).flat();
const officialSource = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return SOURCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

type Text = Record<UiLanguage, string>;

/**
 * Inputs that carry an API token. Every check that needs one is opt-in: a rule names the input in `requires`,
 * and the runner skips it unless the workflow sets the secret. Nothing is sent to the service without it.
 */
export const TOKEN_INPUTS = {
  "ipinfo-token": { secret: "IPINFO_TOKEN", service: "ipinfo.io" },
} as const;
export type TokenInput = keyof typeof TOKEN_INPUTS;

export interface Rule {
  id: string;
  severity: Severity;
  title: Text;
  legal_basis?: Text;
  /** One sentence: how check.ts detects it, naming the data files it uses. Shown in docs/checks.html. */
  how: string;
  fix_hint: Text;
  /** Token inputs the rule needs. Without them it is skipped. */
  requires?: TokenInput[];
  meta: { last_reviewed: string; sources: string[] };
}

export function loadRule(file: string): Rule {
  const rule = loadYaml<Rule>(file);
  const problems = validateRule(rule);
  if (problems.length) throw new Error(`${file}: ${problems.join("; ")}`);
  return rule;
}

/** Returns what is wrong with a rule; empty when it is valid. */
export function validateRule(rule: Rule, today = new Date()): string[] {
  const p: string[] = [];
  const text = (name: string, value: unknown, required = true) => {
    if (value === undefined && !required) return;
    for (const lang of LANGUAGES) {
      const v = (value as Text | undefined)?.[lang];
      if (typeof v !== "string" || !v.trim()) p.push(`${name}.${lang} is missing`);
    }
  };
  if (!ID.test(rule?.id ?? "")) p.push(`id "${rule?.id}" does not match ${ID}`);
  if (!SEVERITIES.includes(rule?.severity)) p.push(`severity must be one of ${SEVERITIES.join(", ")}`);
  text("title", rule?.title);
  text("legal_basis", rule?.legal_basis, false);
  text("fix_hint", rule?.fix_hint);
  if (typeof rule?.how !== "string" || rule.how.trim().length < 20) p.push("how must say in one sentence how the check works");
  if (rule?.requires !== undefined && (!Array.isArray(rule.requires) || rule.requires.some((r) => !(r in TOKEN_INPUTS)))) {
    p.push(`requires must be a list of token inputs: ${Object.keys(TOKEN_INPUTS).join(", ")}`);
  }
  const reviewed = new Date(rule?.meta?.last_reviewed ?? "");
  if (Number.isNaN(reviewed.getTime())) p.push("meta.last_reviewed must be a date (YYYY-MM-DD)");
  else if ((today.getTime() - reviewed.getTime()) / DAY > REVIEW_DAYS) p.push(`meta.last_reviewed is older than ${REVIEW_DAYS} days`);
  if (!Array.isArray(rule?.meta?.sources)) p.push("meta.sources must be a list");
  // Every rule needs evidence: a law for a legal basis, a standard or guideline for a technical rule.
  if (Array.isArray(rule?.meta?.sources) && !rule.meta.sources.length) p.push("meta.sources needs at least one source");
  for (const url of rule?.meta?.sources ?? []) {
    if (!officialSource(url)) p.push(`source ${url} is not from a domain in data/source-domains.yml`);
  }
  return p;
}
