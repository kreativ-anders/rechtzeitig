import { defineCheck, fail, loadYaml, msg, pass, siteRequests, skip, unique, warn, type Finding } from "../../../src/sdk.ts";

const DATA = loadYaml<{ endpoints: Array<{ hosts: string[]; paths: string[] }>; consent_state: string; tcf_string: string }>("data/google-tags.yml");

const isTagRequest = (url: URL) =>
  DATA.endpoints.some(
    (e) => e.hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)) && e.paths.some((p) => url.pathname.startsWith(p)),
  );

// gcs is "G1" plus one digit for ad_storage and one for analytics_storage: 1 granted, 0 denied.
// Anything else ("G1--", empty) carries no readable consent state.
const GCS = /^G1([01])([01])$/;
// An unfilled macro such as ${GDPR_CONSENT_755} is no TC string.
const tcString = (value: string | null) => !!value && !value.startsWith("${");

type Kind = "granted" | "tcf" | "no_signal" | "denied";

export default defineCheck({
  run(ctx) {
    const hits = siteRequests(ctx).flatMap((r) => {
      let url: URL;
      try {
        url = new URL(r.url);
      } catch {
        return [];
      }
      if (!isTagRequest(url)) return [];
      const gcs = url.searchParams.get(DATA.consent_state) ?? "";
      const state = GCS.exec(gcs);
      const kind: Kind = tcString(url.searchParams.get(DATA.tcf_string)) ? "tcf"
        : !state ? "no_signal"
        : state[1] === "1" || state[2] === "1" ? "granted"
        : "denied";
      return [{ kind, host: url.hostname, path: url.pathname, gcs: gcs || "-", page: r.page }];
    });
    if (!hits.length) return skip(msg("no_requests"));

    const details = (kind: Kind): Finding[] =>
      unique(hits.filter((h) => h.kind === kind), (h) => `${h.host}${h.path}\n${h.gcs}\n${h.page}`)
        .map(({ host, path, gcs, page }) => ({ key: "request", params: { request: `${host}${path}`, gcs, page } }));
    const count = (kind: Kind) => hits.filter((h) => h.kind === kind).length;

    if (count("granted") || count("tcf")) {
      const key = count("granted") ? "granted" : "tcf";
      return fail(msg(key, { count: count(key) }), [...details("granted"), ...details("tcf")]);
    }
    if (count("no_signal")) return warn(msg("no_signal", { count: count("no_signal") }), details("no_signal"));
    return pass(msg("denied", { count: count("denied") }));
  },
});
