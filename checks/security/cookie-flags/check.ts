import { defineCheck, pass, siteCookies, skip, warn } from "../../../src/sdk.ts";

const SESSION = /sess|sid|token|auth|login|remember/i;
const READ_BY_SCRIPT = /csrf|xsrf/i;

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    if (!cookies.length) return skip("No cookies set without login.");
    const issues: string[] = [];
    for (const c of cookies) {
      const missing = [
        ctx.https && !c.secure ? "Secure" : "",
        SESSION.test(c.name) && !READ_BY_SCRIPT.test(c.name) && !c.httpOnly ? "HttpOnly" : "",
        c.sameSite === "None" && !c.secure ? "Secure (required with SameSite=None)" : "",
      ].filter(Boolean);
      if (missing.length) issues.push(`${c.name}: missing ${[...new Set(missing)].join(", ")}`);
    }
    if (issues.length) return warn(`${issues.length} of ${cookies.length} cookie(s) lack security flags.`, issues);
    return pass(`All ${cookies.length} cookie(s) have the expected flags.`);
  },
});
