import { defineCheck, fail, loadYaml, msg, pass, skip, warn } from "../../../src/sdk.ts";

const OLD = new Set(["SSLv3", "TLSv1", "TLSv1.1"]);
const { warn_days: WARN_DAYS } = loadYaml<Record<string, { warn_days: number }>>("data/thresholds.yml")["security/tls"];

export default defineCheck({
  run(ctx) {
    const tls = ctx.tls;
    if (!tls) return skip(msg("none"));
    if (tls.error && !tls.protocol) return fail(msg("failed", { error: tls.error }));
    if (!tls.authorized) return fail(tls.error ? msg("untrusted_error", { error: tls.error }) : msg("untrusted"));
    if (OLD.has(tls.protocol)) return fail(msg("outdated", { protocol: tls.protocol }));
    if (tls.daysLeft < WARN_DAYS) return warn(msg("expires", { count: tls.daysLeft, date: tls.validTo }));
    return pass(msg("valid", { protocol: tls.protocol, date: tls.validTo }));
  },
});
