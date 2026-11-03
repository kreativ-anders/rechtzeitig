import { defineCheck, pass, skip, warn } from "../../../src/sdk.ts";

const SESSION = /sess|sid|token|auth|login|remember/i;
const READ_BY_SCRIPT = /csrf|xsrf/i;

export default defineCheck({
  title: "Cookies use secure flags",
  law: "Art. 32 GDPR",
  run(ctx) {
    const cookies = new Map(ctx.sitePages.flatMap((p) => [...p.noJs.cookies, ...p.js.cookies]).map((c) => [`${c.name}@${c.domain}`, c]));
    if (!cookies.size) return skip("No cookies set without login.");
    const https = ctx.url.startsWith("https:");
    const issues: string[] = [];
    for (const c of cookies.values()) {
      const missing = [
        https && !c.secure ? "Secure" : "",
        SESSION.test(c.name) && !READ_BY_SCRIPT.test(c.name) && !c.httpOnly ? "HttpOnly" : "",
        c.sameSite === "None" && !c.secure ? "Secure (required with SameSite=None)" : "",
      ].filter(Boolean);
      if (missing.length) issues.push(`${c.name}: missing ${[...new Set(missing)].join(", ")}`);
    }
    if (issues.length) return warn(`${issues.length} of ${cookies.size} cookie(s) lack security flags.`, issues);
    return pass(`All ${cookies.size} cookie(s) have the expected flags.`);
  },
});
