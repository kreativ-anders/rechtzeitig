// Report wording, English only. Checks return message keys with parameters (src/sdk.ts `msg`); this file turns
// them into sentences. The sentences live in lang/en.yml under `messages`:
//   messages:
//     common:            shared by several checks (src/sdk.ts helpers)
//       no_link: "No link to the {page} on the start page."
//     security/secrets:  one group per check id
//       found: { one: "{count} secret found.", other: "{count} secrets found." }
// A value with `one`/`other` is chosen by the `count` parameter (Intl.PluralRules).
// Readable reports in other languages are built from the keys and parameters of the report JSON, outside this engine.

import { loadYaml } from "./data.ts";
import type { Finding, Msg, Params } from "./sdk.ts";

type Template = string | Partial<Record<Intl.LDMLPluralRule, string>>;
type Pack = Record<string, Record<string, Template>>;

/** The file that holds the messages. Other files in lang/ hold only detection patterns. */
export const MESSAGES_FILE = "lang/en.yml";
let pack: { locale: string; messages: Pack } | undefined;
function load() {
  if (!pack) {
    const file = loadYaml<{ locale: string; messages?: Pack }>(MESSAGES_FILE);
    pack = { locale: file.locale, messages: file.messages ?? {} };
  }
  return pack;
}

/** Every message key, as "<group>.<key>". */
export const messageKeys = (): string[] =>
  Object.entries(load().messages).flatMap(([group, keys]) => Object.keys(keys).map((k) => `${group}.${k}`));

/** A message in English. `scope` is the check id; keys not found there come from `common`. */
export function render(m: Msg | string, scope: string): string {
  if (typeof m === "string") return m; // engine errors (src/runner.ts) are plain text
  const { locale, messages } = load();
  const template = messages[scope]?.[m.key] ?? messages.common?.[m.key];
  if (template === undefined) throw new Error(`${MESSAGES_FILE}: messages.${scope}.${m.key} is missing`);
  const params = m.params ?? {};
  const text = typeof template === "string" ? template : pick(template, params.count, locale);
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    const value = params[name];
    if (value === undefined) return all;
    return typeof value === "object" ? render(value, scope) : String(value);
  });
}

function pick(forms: Partial<Record<Intl.LDMLPluralRule, string>>, count: Params[string] | undefined, locale: string): string {
  const rule = typeof count === "number" ? new Intl.PluralRules(locale).select(count) : "other";
  const text = forms[rule] ?? forms.other;
  if (text === undefined) throw new Error(`plural form "${rule}" or "other" is missing`);
  return text;
}

/** The text of one detail without its place: the rendered key, or the value shown as it is. */
export const findingText = (f: Finding | string, scope: string): string =>
  typeof f === "string" ? f : f.key ? render({ key: f.key, params: f.params }, scope) : (f.text ?? "");

/** One detail line: "file:line: text" for findings in files, the text alone otherwise. */
export function renderFinding(f: Finding | string, scope: string): string {
  if (typeof f === "string") return f;
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "";
  return [where, findingText(f, scope)].filter(Boolean).join(": ");
}
