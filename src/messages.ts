// Report wording. Checks return message keys with parameters (src/sdk.ts `msg`); this file turns them into
// sentences in the report language. The sentences live in lang/<code>.yml under `messages`:
//   messages:
//     common:            shared by several checks (src/sdk.ts helpers)
//       no_link: "No link to the {page} on the start page."
//     security/secrets:  one group per check id
//       found: { one: "{count} secret found.", other: "{count} secrets found." }
// A value with `one`/`other` is chosen by the `count` parameter (Intl.PluralRules).

import { loadYaml } from "./data.ts";
import type { Finding, Msg, Params } from "./sdk.ts";

type Template = string | Partial<Record<Intl.LDMLPluralRule, string>>;
type Pack = Record<string, Record<string, Template>>;

const packs = new Map<string, { locale: string; messages: Pack }>();
function pack(lang: string) {
  let p = packs.get(lang);
  if (!p) {
    const file = loadYaml<{ locale: string; messages?: Pack }>(`lang/${lang}.yml`);
    p = { locale: file.locale, messages: file.messages ?? {} };
    packs.set(lang, p);
  }
  return p;
}

/** Every message key a language defines, as "<group>.<key>". For the test that all languages match. */
export const messageKeys = (lang: string): string[] =>
  Object.entries(pack(lang).messages).flatMap(([group, keys]) => Object.keys(keys).map((k) => `${group}.${k}`));

/** A message in `lang`. `scope` is the check id; keys not found there come from `common`. */
export function render(m: Msg | string, scope: string, lang: string): string {
  if (typeof m === "string") return m; // engine errors (src/runner.ts) are plain text
  const { locale, messages } = pack(lang);
  const template = messages[scope]?.[m.key] ?? messages.common?.[m.key];
  if (template === undefined) throw new Error(`lang/${lang}.yml: messages.${scope}.${m.key} is missing`);
  const params = m.params ?? {};
  const text = typeof template === "string" ? template : pick(template, params.count, locale);
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    const value = params[name];
    if (value === undefined) return all;
    if (typeof value !== "object") return String(value);
    return "key" in value ? render(value as Msg, scope, lang) : ((value as Record<string, string>)[lang] ?? (value as Record<string, string>).en);
  });
}

function pick(forms: Partial<Record<Intl.LDMLPluralRule, string>>, count: Params[string] | undefined, locale: string): string {
  const rule = typeof count === "number" ? new Intl.PluralRules(locale).select(count) : "other";
  const text = forms[rule] ?? forms.other;
  if (text === undefined) throw new Error(`plural form "${rule}" or "other" is missing`);
  return text;
}

/** One detail line: "file:line: text" for findings in files, the text alone otherwise. */
export function renderFinding(f: Finding | string, scope: string, lang: string): string {
  if (typeof f === "string") return f;
  const text = f.key ? render({ key: f.key, params: f.params }, scope, lang) : (f.text ?? "");
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "";
  return [where, text].filter(Boolean).join(": ");
}
