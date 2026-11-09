import { WORKFLOWS, capped, defineRepoCheck, fail, loadYaml, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

const DATA = loadYaml<{
  untrusted: string[];
  ai_agent_actions: string[];
  ai_agent_commands: string;
  outsider_triggers: string[];
  open_to_all: string[];
  code_write_scopes: string[];
  member_gate: string;
}>("data/workflow-risks.yml");
const UNTRUSTED = new RegExp(`\\$\\{\\{[^}]*\\b(${DATA.untrusted.join("|")})`);
const AGENT_ACTIONS = new Set(DATA.ai_agent_actions.map((a) => a.toLowerCase()));
const AGENT_COMMAND = new RegExp(DATA.ai_agent_commands);
const MEMBER_GATE = new RegExp(DATA.member_gate);

interface Step { uses?: unknown; run?: unknown; with?: Record<string, unknown>; env?: Record<string, unknown>; if?: unknown }
interface Job { permissions?: unknown; steps?: Step[]; if?: unknown; env?: Record<string, unknown> }
interface Workflow { on?: unknown; permissions?: unknown; jobs?: Record<string, Job> }

const triggers = (on: unknown): string[] =>
  typeof on === "string" ? [on] : Array.isArray(on) ? on.map(String) : on && typeof on === "object" ? Object.keys(on) : [];

/**
 * Whether the first permissions value that is set grants write on one of `scopes` (undefined: any scope).
 * No permissions at all may mean the repository's write default.
 */
function writes(scopes: string[] | undefined, ...levels: unknown[]): boolean {
  const set = levels.find((p) => p !== undefined);
  if (set === undefined) return true;
  if (typeof set === "string") return set === "write-all";
  return !!set && typeof set === "object" && Object.entries(set).some(([k, v]) => v === "write" && (!scopes || scopes.includes(k)));
}

const isAgent = (step: Step) =>
  (typeof step.uses === "string" && AGENT_ACTIONS.has(step.uses.split("@")[0].toLowerCase())) ||
  (typeof step.run === "string" && AGENT_COMMAND.test(step.run));

export default defineRepoCheck({
  run(repo) {
    const workflows = repo.find(WORKFLOWS);
    if (!workflows.length) return skip(msg("no_workflows"));
    const failed: Finding[] = [];
    const warned: Finding[] = [];
    let agents = 0;

    for (const file of workflows) {
      const doc = repo.yaml<Workflow>(file);
      const lines = (repo.read(file) ?? "").split("\n");
      const trigger = triggers(doc?.on).find((t) => DATA.outsider_triggers.includes(t));
      for (const job of Object.values(doc?.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          if (!step || typeof step !== "object" || !isAgent(step)) continue;
          agents++;
          if (!trigger) continue;
          // A job or step only members can start reads no outsider text as a command.
          if (MEMBER_GATE.test(`${String(job.if ?? "")} ${String(step.if ?? "")}`)) continue;
          const name = typeof step.uses === "string" ? step.uses.split("@")[0] : "run";
          const start = lines.findIndex((l) => (typeof step.uses === "string" ? l.includes(step.uses) : l.includes(String(step.run).split("\n")[0])));
          const lineOf = (needle: string) => {
            const i = lines.findIndex((l, n) => n >= Math.max(start, 0) && l.includes(needle));
            return i >= 0 ? i + 1 : start + 1 || undefined;
          };
          // `run:` itself is security/workflow-risks territory; env: is the safe way for a shell, not for a prompt.
          const inputs = { ...job.env, ...step.env, ...step.with };
          const secrets = JSON.stringify(inputs).includes("secrets.");
          const privileged = secrets || writes(undefined, job.permissions, doc?.permissions);

          // Outsider text in the prompt, an env value or the command line of the agent.
          for (const value of Object.values(inputs)) {
            const expr = typeof value === "string" ? UNTRUSTED.exec(value) : null;
            if (!expr) continue;
            const finding = { file, line: lineOf(expr[1]), key: privileged ? "injection" : "injection_readonly", params: { agent: name, expr: expr[1], trigger } };
            (privileged ? failed : warned).push(finding);
            break;
          }
          // Inputs that let anyone start the agent, not only users with write access.
          // A failure when the token can change code; with only issue or comment rights, a warning.
          for (const input of DATA.open_to_all) {
            const v = step.with?.[input];
            if (typeof v === "string" && v.split(",").some((u) => u.trim() === "*")) {
              const code = writes(DATA.code_write_scopes, job.permissions, doc?.permissions);
              (code ? failed : warned).push({ file, line: lineOf(input), key: code ? "open_to_all" : "open_to_all_limited", params: { agent: name, input, trigger } });
            }
          }
        }
      }
    }

    if (!agents) return pass(msg("no_agents", { count: workflows.length }));
    const all = [...failed, ...warned];
    if (failed.length) return fail(msg("risky", { count: all.length }), capped(all));
    if (warned.length) return warn(msg("risky", { count: warned.length }), capped(warned));
    return pass(msg("none", { count: agents }));
  },
});
