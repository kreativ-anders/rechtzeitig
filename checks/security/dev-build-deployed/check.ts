import { FIXTURES, capped, defineCrossCheck, fail, info, loadYaml, msg, pass, siteRequests, warn, type Finding, type RepoContext } from "../../../src/sdk.ts";

const DATA = loadYaml<{
  live: Array<{ name: string; in: Array<"script" | "document" | "request" | "probe">; pattern: string }>;
  deploy: string;
  deploy_dev: string;
  commands: string[];
  settings_files: string;
  settings: string[];
}>("data/dev-builds.yml");
const LIVE = DATA.live.map((l) => ({ name: l.name, in: l.in, re: new RegExp(l.pattern) }));
const DEPLOY = new RegExp(DATA.deploy);
const DEPLOY_DEV = new RegExp(DATA.deploy_dev, "i");
const COMMANDS = DATA.commands.map((c) => new RegExp(c));
const SETTINGS_FILES = new RegExp(DATA.settings_files);
const SETTINGS = DATA.settings.map((s) => new RegExp(s));
// In a Dockerfile only the start command counts: RUN npm install vite installs, it does not start.
const DOCKER_START = /^\s*(CMD|ENTRYPOINT)\b/i;
// CMD ["npm", "run", "dev"] is the same command as CMD npm run dev.
const execForm = (line: string) => line.replace(/["',[\]]+/g, " ");
const isDocker = (f: string) => /(Dockerfile|Containerfile)$/.test(f);

/** Where the repository starts a dev server in production (`deploy`), and debug switches in settings files. */
function repoEvidence(repo: RepoContext): { start: Finding[]; settings: Finding[]; unread: string[] } {
  const start: Finding[] = [];
  const settings: Finding[] = [];
  const unread: string[] = [];
  const files = repo.files.filter((f) => !FIXTURES.test(f) && !/(^|\/)node_modules\//.test(f));
  for (const file of files) {
    const name = file.split("/").pop()!;
    const deploy = DEPLOY.test(file) && !DEPLOY_DEV.test(name);
    const pkg = name === "package.json";
    const set = SETTINGS_FILES.test(file) && !DEPLOY_DEV.test(name.replace(/^\.env/, ""));
    if (!deploy && !pkg && !set) continue;
    const text = repo.read(file);
    if (text === undefined) {
      if (deploy && (repo.coverage.large.includes(file) || repo.coverage.lfs.includes(file))) unread.push(file);
      continue;
    }
    const lines = text.split("\n");
    if (pkg) {
      const script = repo.yaml<{ scripts?: { start?: unknown } }>(file)?.scripts?.start;
      if (typeof script === "string" && COMMANDS.some((re) => re.test(script))) {
        const at = lines.findIndex((l) => /"start"\s*:/.test(l));
        start.push({ file, line: at + 1 || 1, key: "start_script", params: { command: script.slice(0, 80) } });
      }
      continue;
    }
    lines.forEach((line, i) => {
      if (deploy && (!isDocker(file) || DOCKER_START.test(line)) && COMMANDS.some((re) => re.test(execForm(line)))) {
        start.push({ file, line: i + 1, key: "start_command", params: { command: line.trim().slice(0, 80) } });
      }
      if (set && SETTINGS.some((re) => re.test(line))) settings.push({ file, line: i + 1, key: "setting", params: { setting: line.trim().slice(0, 80) } });
    });
  }
  return { start, settings, unread };
}

export default defineCrossCheck({
  run(ctx, repo) {
    // Website side: traces only a dev server or a debug build sends, in served code, request URLs and error probes.
    const live: Finding[] = [];
    const sources = [
      ...ctx.code.filter((c) => !ctx.isThirdParty(new URL(c.url).hostname)).map((c) => ({ kind: c.type, where: ctx.short(c.url), text: c.body })),
      ...siteRequests(ctx).filter((r) => !ctx.isThirdParty(r.host)).map((r) => ({ kind: "request" as const, where: r.page, text: r.url })),
      ...ctx.probes.filter((p) => p.kind === "error").map((p) => ({ kind: "probe" as const, where: p.path, text: p.body })),
    ];
    for (const { name, in: kinds, re } of LIVE) {
      if (live.some((l) => l.params?.name === name)) continue;
      const hit = sources.find((s) => kinds.includes(s.kind) && re.test(s.text));
      if (hit) live.push({ key: "live", params: { name, where: hit.where } });
    }
    const { start, settings, unread } = repoEvidence(repo);

    if (live.length) {
      const repoSide = [...start, ...settings];
      const names = live.map((l) => String(l.params?.name)).join(", ");
      if (repoSide.length) return fail(msg("deployed", { names }), capped([...live, ...repoSide]));
      // The site runs a dev build, but the repository starts none: the host's build or start settings differ.
      return warn(msg("deployed_elsewhere", { names }), capped(live));
    }
    // Only a deploy file counts alone: a start script of "vite" is common in projects that deploy a static build.
    const deployStart = start.filter((f) => f.key === "start_command");
    if (deployStart.length) return info(msg("start_only", { count: deployStart.length }), capped(deployStart));
    if (unread.length) return info(msg("unread", { count: unread.length }), capped(unread.map((file) => ({ file, key: "unread_file" }))));
    return pass(msg("none"));
  },
});
