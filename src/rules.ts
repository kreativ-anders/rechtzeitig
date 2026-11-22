// Rule metadata: checks/<category>/<name>/rule.yml. Detection lives in check.ts next to it.
// Legal and wording updates are data updates here, never engine changes. Texts are English only; the German
// texts of v0.8.0 and earlier stay in the rule.yml files at tag v0.8.0.

import { loadYaml } from "./data.ts";
import { DAY } from "./deadline.ts";
import { hostIn } from "./text.ts";

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * SEC security, LEG-DE German law, LEG-EU EU law, LEG-DFA Digital Fairness Act proposal, A11Y accessibility, PRC prices,
 * SUS sustainability, QUAL code quality.
 */
const ID = /^((SEC|LEG-DE|LEG-EU|A11Y|PRC|SUS|QUAL)-[A-Z0-9]+|LEG-DFA)-\d{3}$/;
/**
 * Groups whose rules have no legal basis by design (checks/<group>/). Each of their rules states its `value`
 * instead, and none may name a `legal_basis`, so a reader never takes a finding there for a legal duty.
 * `dfa` rests on a legislative proposal (data/proposals.yml), which is no law.
 */
export const NO_LEGAL_BASIS_GROUPS = ["quality", "dfa"] as const;
/**
 * A rule whose review is older than this fails the project's tests and `npm run docs` (reviewProblems), so legal
 * texts get looked at again. A scan never fails on it: a pinned release keeps working after a year.
 */
export const REVIEW_DAYS = 365;

/** Domains a source may come from (data/source-domains.yml): primary sources only. */
const SOURCE_DOMAINS = Object.values(loadYaml<Record<string, string[]>>("data/source-domains.yml")).flat();
const officialSource = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return SOURCE_DOMAINS.some((d) => hostIn(host, d));
  } catch {
    return false;
  }
};

/**
 * A legislative proposal from data/proposals.yml. Its rules are the group checks/<id>/: no law backs them, so they
 * have no legal_basis and a `value` that starts with the proposal's title.
 */
export interface Proposal {
  id: string;
  title: string;
  procedure?: string;
  status: "proposal" | "adopted" | "in force" | "applies";
  /** Last day status and articles were compared with the source (YYYY-MM-DD). */
  checked: string;
  applies?: string;
  sources: string[];
}
export const PROPOSALS: Proposal[] = loadYaml<Proposal[]>("data/proposals.yml");

/** A text of a rule or a data file: English, one non-empty string. */
export const isText = (value: unknown): value is string => typeof value === "string" && !!value.trim();

/**
 * Inputs that turn a rule on or off. A rule names them in `requires`; the runner skips it unless each is on.
 * - `secret`: on when the workflow sets that secret (opt-in, nothing is sent to `service` without it).
 * - `default: false`: on when the input is `true` (opt-in for sites it applies to).
 * - `default: true`: on unless the input is `false` (opt-out; `service` is where data goes).
 * The wiki pages Inputs and Checks* (npm run docs) and the skip messages are generated from this list.
 */
export const SWITCHES = {
  "ipinfo-token": { secret: "IPINFO_TOKEN", service: "ipinfo.io" },
  subscriptions: { default: false },
  sales: { default: false },
  // Every lookup at an outside service is opt-in: off unless the input is true or the secret is set.
  vulnerabilities: { default: false, service: "api.osv.dev" },
  "green-hosting": { default: false, service: "api.thegreenwebfoundation.org" },
} as const satisfies Record<string, { secret: string; service: string } | { default: boolean; service?: string }>;
export type Switch = keyof typeof SWITCHES;
/** One switch with every field optional, so callers need no cast. */
export const switchSpec = (input: Switch): { secret?: string; default?: boolean; service?: string } => SWITCHES[input];

export interface Rule {
  id: string;
  severity: Severity;
  title: string;
  legal_basis?: string;
  /**
   * Why the rule is worth running when it has no legal basis: the benefit for the project, in one sentence.
   * Required in NO_LEGAL_BASIS_GROUPS, never together with `legal_basis`. Shown as "No legal basis: <value>".
   */
  value?: string;
  /** One sentence: how check.ts detects it, naming the data files it uses. Shown on the wiki pages Checks-<Group>. */
  how: string;
  fix_hint: string;
  /** Inputs the rule needs (SWITCHES). Without them it is skipped. */
  requires?: Switch[];
  meta: { last_reviewed: string; sources: string[] };
}

/**
 * Loads checks/<group>/<name>/rule.yml and validates its structure, with the group taken from the path.
 * The age of the review is not checked here (see reviewProblems), so a scan never stops because of the date.
 */
export function loadRule(file: string): Rule {
  const rule = loadYaml<Rule>(file);
  const group = file.split(/[\\/]/).at(-3);
  const problems = validateRule(rule, group);
  if (problems.length) throw new Error(`${file}: ${problems.join("; ")}`);
  return rule;
}

/**
 * Returns what is wrong with the structure of a rule; empty when it is valid. `group` is the folder below checks/.
 * Independent of the date: the age of the review is reviewProblems.
 */
export function validateRule(rule: Rule, group?: string): string[] {
  const p: string[] = [];
  const text = (name: string, value: unknown, required = true) => {
    if (value === undefined && !required) return;
    if (!isText(value)) p.push(`${name} must be a text in English`);
  };
  if (!ID.test(rule?.id ?? "")) p.push(`id "${rule?.id}" does not match ${ID}`);
  if (!SEVERITIES.includes(rule?.severity)) p.push(`severity must be one of ${SEVERITIES.join(", ")}`);
  text("title", rule?.title);
  text("legal_basis", rule?.legal_basis, false);
  text("value", rule?.value, false);
  if (rule?.value !== undefined && rule?.legal_basis !== undefined) p.push("value is only for rules without legal_basis");
  if ((NO_LEGAL_BASIS_GROUPS as readonly string[]).includes(group ?? "")) {
    if (rule?.legal_basis !== undefined) p.push(`rules in ${group}/ have no legal_basis`);
    if (rule?.value === undefined) p.push(`rules in ${group}/ need value: why the rule is worth running`);
  }
  // A rule based on a proposal names it first, so its value never reads like a law.
  const proposal = PROPOSALS.find((x) => x.id === group);
  if (proposal && !rule?.value?.startsWith(proposal.title)) p.push(`rules in ${group}/ need value: "${proposal.title}, <article>: ..."`);
  text("fix_hint", rule?.fix_hint);
  if (typeof rule?.how !== "string" || rule.how.trim().length < 20) p.push("how must say in one sentence how the check works");
  if (rule?.requires !== undefined && (!Array.isArray(rule.requires) || rule.requires.some((r) => !(r in SWITCHES)))) {
    p.push(`requires must be a list of inputs: ${Object.keys(SWITCHES).join(", ")}`);
  }
  const reviewed = new Date(rule?.meta?.last_reviewed ?? "");
  if (Number.isNaN(reviewed.getTime())) p.push("meta.last_reviewed must be a date (YYYY-MM-DD)");
  if (!Array.isArray(rule?.meta?.sources)) p.push("meta.sources must be a list");
  // Every rule needs evidence: a law for a legal basis, a standard or guideline for a technical rule.
  if (Array.isArray(rule?.meta?.sources) && !rule.meta.sources.length) p.push("meta.sources needs at least one source");
  for (const url of rule?.meta?.sources ?? []) {
    if (!officialSource(url)) p.push(`source ${url} is not from a domain in data/source-domains.yml`);
  }
  return p;
}

/** Maintenance check, run by the tests and `npm run docs`, never by a scan: a review older than REVIEW_DAYS on `today`. */
export function reviewProblems(rule: Rule, today = new Date()): string[] {
  const reviewed = new Date(rule?.meta?.last_reviewed ?? "");
  if (Number.isNaN(reviewed.getTime())) return [];
  return (today.getTime() - reviewed.getTime()) / DAY > REVIEW_DAYS ? [`meta.last_reviewed is older than ${REVIEW_DAYS} days`] : [];
}
