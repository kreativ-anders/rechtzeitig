import { defineCheck, fail, pass, skip, warn } from "../../../src/sdk.ts";

const OLD = new Set(["SSLv3", "TLSv1", "TLSv1.1"]);
const WARN_DAYS = 14;

export default defineCheck({
  run(ctx) {
    const tls = ctx.tls;
    if (!tls) return skip("No TLS connection to check.");
    if (tls.error && !tls.protocol) return fail(`TLS connection failed: ${tls.error}`);
    if (!tls.authorized) return fail(`The certificate is not trusted: ${tls.error}`);
    if (OLD.has(tls.protocol)) return fail(`The server uses ${tls.protocol}, which is outdated. Use TLS 1.2 or 1.3.`);
    if (tls.daysLeft < WARN_DAYS) return warn(`The certificate expires in ${tls.daysLeft} day(s), on ${tls.validTo}.`);
    return pass(`${tls.protocol}, certificate valid until ${tls.validTo}.`);
  },
});
