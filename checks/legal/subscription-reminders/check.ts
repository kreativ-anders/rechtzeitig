import {
  codeFiles, defineRepoCheck, directPackages, grepFiles, info, loadYaml, msg, packageMatches, pass, skip, unreadResult,
  type Finding, type Vendor,
} from "../../../src/sdk.ts";

type Kind = "trial" | "trial_reminder" | "recurring" | "renewal_reminder";
const PATTERNS = loadYaml<Record<Kind, string[]>>("data/subscription-billing.yml");
const PAYMENT = loadYaml<Vendor[]>("data/third-parties.yml").filter((v) => v.purpose === "payment" && v.packages?.length);

export default defineRepoCheck({
  run(repo) {
    const names = [...directPackages(repo).packages.map((p) => p.name), ...repo.components.filter((c) => !c.dev).map((c) => c.name)];
    const providers = PAYMENT.filter((v) => names.some((n) => v.packages!.some((p) => packageMatches(n, p)))).map((v) => v.name);
    if (!providers.length) return skip(msg("no_provider"));
    const files = codeFiles(repo).map((f) => f.file);
    const own = new Set(files);
    const grep = (kind: Kind) => grepFiles(repo, { test: (f) => own.has(f) }, PATTERNS[kind].map((p) => new RegExp(p)));
    const [trial, trialReminder, recurring, renewalReminder] = (["trial", "trial_reminder", "recurring", "renewal_reminder"] as const).map(grep);
    const found: Finding[] = [];
    // The provider can send these emails itself (a dashboard setting the scan cannot see), so this is a hint.
    if (trial.matches.length && !trialReminder.matches.length) {
      const m = trial.matches[0];
      found.push({ file: m.file, line: m.line, key: "trial_no_reminder", params: { providers: providers.join(", ") } });
    }
    if (recurring.matches.length && !renewalReminder.matches.length) {
      const m = recurring.matches[0];
      found.push({ file: m.file, line: m.line, key: "renewal_no_reminder", params: { providers: providers.join(", ") } });
    }
    if (found.length) return info(msg("found", { count: found.length }), found);
    const gap = unreadResult(repo, files);
    if (gap) return gap;
    if (!trial.matches.length && !recurring.matches.length) return pass(msg("none", { providers: providers.join(", "), count: files.length }));
    return pass(msg("handled", { providers: providers.join(", ") }));
  },
});
