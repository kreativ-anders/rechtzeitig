// Decides before the scan whether the SARIF upload (input sarif-upload) can work in this run, so a run where
// GitHub does not allow it skips the upload with a notice instead of a failed step. Gets the job's token,
// which the scan step never sees. Sends one request, to the code scanning API of the own repository.
//   auto (default, also when empty): upload when possible, otherwise ::notice:: and skip.
//   true: the same, but a skip or a failed upload is a ::warning::.
//   false: action.yml does not run this step.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SARIF_MODES = ["auto", "true", "false"] as const;
const HELP = "https://rechtzeitig.dev/workflow.html#security-tab";

export type Skip = "local" | "fork" | "dependabot" | "no-code-security" | "permission";
export interface Decision { upload: boolean; reason?: Skip; note: string }

const NOTES: Record<Skip, string> = {
  local: "not running on GitHub Actions.",
  fork: "a pull request from a fork gets a read-only token.",
  dependabot: "runs started by Dependabot get a read-only token.",
  "no-code-security": "code scanning is not available for this repository. Private repositories need GitHub Code Security; on GitHub Free and Pro only public repositories have it.",
  permission: "the token may not use code scanning. Give the job the permissions security-events: write, and actions: read in private repositories.",
};
const skip = (reason: Skip): Decision => ({ upload: false, reason, note: `rechtzeitig: SARIF upload skipped: ${NOTES[reason]} The findings are in the report. See ${HELP}` });

type Env = Record<string, string | undefined>;

/** Whether this run can upload SARIF. Unknown answers (network error, other status) try the upload. */
export async function decide(env: Env = process.env, fetcher: typeof fetch = fetch): Promise<Decision> {
  if (!env.GITHUB_ACTIONS) return skip("local");
  if (env.GITHUB_EVENT_NAME?.startsWith("pull_request") && !sameRepository(env)) return skip("fork");
  if ([env.GITHUB_ACTOR, env.GITHUB_TRIGGERING_ACTOR].includes("dependabot[bot]")) return skip("dependabot");
  const api = env.GITHUB_API_URL || "https://api.github.com";
  try {
    const res = await fetcher(`${api}/repos/${env.GITHUB_REPOSITORY}/code-scanning/analyses?per_page=1`, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    // 404: code scanning is available, there is just no analysis yet.
    if (res.status === 200 || res.status === 404) return { upload: true, note: "" };
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      return skip(/advanced security|code security/i.test(body) ? "no-code-security" : "permission");
    }
  } catch {
    // The upload step tries anyway and reports its own failure.
  }
  return { upload: true, note: "" };
}

/** For pull_request events: whether the head branch is in this repository. A missing head repository counts as a fork. */
function sameRepository(env: Env): boolean {
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8"));
    return event?.pull_request?.head?.repo?.full_name === env.GITHUB_REPOSITORY;
  } catch {
    return false;
  }
}

/** Empty counts as the default auto, so runs without the Run workflow dialog (schedule, push) behave the same. */
export function sarifMode(value: string | undefined): (typeof SARIF_MODES)[number] | undefined {
  const mode = (value ?? "").trim() || "auto";
  return (SARIF_MODES as readonly string[]).includes(mode) ? (mode as (typeof SARIF_MODES)[number]) : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = sarifMode(process.env.MODE);
  if (!mode) {
    console.log(`::error::rechtzeitig: sarif-upload must be one of: ${SARIF_MODES.join(", ")}`);
    process.exit(2);
  }
  const decision = mode === "false" ? { upload: false, note: "" } : await decide();
  if (decision.note) console.log(`::${mode === "true" ? "warning" : "notice"}::${decision.note}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `upload=${decision.upload}\n`);
}
