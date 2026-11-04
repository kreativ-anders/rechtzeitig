import { WORKFLOWS, defineRepoCheck, fail, lineAt, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const DATA = loadYaml<{ untrusted: string[]; privileged_triggers: string[]; pr_head: string[]; pipe_to_shell: string }>(
  "data/workflow-risks.yml",
);
const UNTRUSTED = new RegExp(`\\$\\{\\{[^}]*\\b(${DATA.untrusted.join("|")})`);
const PR_HEAD = new RegExp(DATA.pr_head.join("|"));
const PIPE = new RegExp(DATA.pipe_to_shell);
const SCRIPT_KEY = /^(\s*(?:-\s+)?)(run|script):(.*)$/;
const WRITE_ALL = /^\s*permissions:\s*["']?write-all\b/;

interface Workflow {
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, { permissions?: unknown; steps?: Array<{ uses?: string; with?: { ref?: unknown } }> }>;
}

/** Trigger names of `on:`, which may be a string, a list or a map. */
const triggers = (on: unknown): string[] =>
  typeof on === "string" ? [on] : Array.isArray(on) ? on.map(String) : on && typeof on === "object" ? Object.keys(on) : [];

/** Lines inside `run:` and `script:` values, with their 1-based line numbers. */
function scriptLines(text: string): Array<{ line: number; code: string }> {
  const out: Array<{ line: number; code: string }> = [];
  let indent = -1;
  text.split("\n").forEach((code, i) => {
    const key = SCRIPT_KEY.exec(code);
    if (key) {
      indent = key[1].length; // column of the key, after a list dash
      out.push({ line: i + 1, code: key[3] });
    } else if (indent >= 0 && (!code.trim() || code.length - code.trimStart().length > indent)) {
      out.push({ line: i + 1, code });
    } else indent = -1;
  });
  return out;
}

export default defineRepoCheck({
  run(repo) {
    const workflows = repo.find(WORKFLOWS);
    if (!workflows.length) return skip(msg("no_workflows"));
    const failed: Finding[] = [];
    const warned: Finding[] = [];

    for (const file of workflows) {
      const text = repo.read(file) ?? "";
      const lines = text.split("\n");
      const doc = repo.yaml<Workflow>(file);

      const trigger = triggers(doc?.on).find((t) => DATA.privileged_triggers.includes(t));
      if (trigger) {
        for (const job of Object.values(doc?.jobs ?? {})) {
          for (const step of job?.steps ?? []) {
            const ref = step?.with?.ref;
            if (!step?.uses?.startsWith("actions/checkout") || typeof ref !== "string" || !PR_HEAD.test(ref)) continue;
            const at = lines.findIndex((l) => /^\s*ref:/.test(l) && l.includes(ref));
            failed.push({ file, line: at + 1 || undefined, key: "checkout_head", params: { trigger } });
          }
        }
      }

      for (const { line, code } of scriptLines(text)) {
        const expr = UNTRUSTED.exec(code);
        if (expr) failed.push({ file, line, key: "injection", params: { expr: expr[1] } });
        if (PIPE.test(code)) warned.push({ file, line, key: "pipe_to_shell" });
      }

      lines.forEach((l, i) => {
        if (WRITE_ALL.test(l)) warned.push({ file, line: i + 1, key: "write_all" });
      });
      const jobs = Object.values(doc?.jobs ?? {});
      if (doc && doc.permissions === undefined && jobs.some((j) => j?.permissions === undefined)) {
        const at = text.search(/^jobs:/m);
        warned.push({ file, line: at >= 0 ? lineAt(text, at) : undefined, key: "no_permissions" });
      }
    }

    if (failed.length) return fail(msg("risky", { count: failed.length + warned.length }), [...failed, ...warned]);
    if (warned.length) return warn(msg("risky", { count: warned.length }), warned);
    return pass(msg("none", { count: workflows.length }));
  },
});
