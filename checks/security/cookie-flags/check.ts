import { defineCheck, info, loadYaml, pass, siteCookies, skip, warn, type Cookie } from "../../../src/sdk.ts";

const NAMES = loadYaml<{ session: string[]; read_by_script: string[] }>("data/cookies.yml");
const SESSION = new RegExp(NAMES.session.join("|"), "i");
const READ_BY_SCRIPT = new RegExp(NAMES.read_by_script.join("|"), "i");

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    if (!cookies.length) return skip("No cookies set without login.");
    const missing = (c: Cookie) => [
      !c.secure && c.sameSite === "None" ? "Secure (required with SameSite=None)" : !c.secure && ctx.https ? "Secure" : "",
      SESSION.test(c.name) && !READ_BY_SCRIPT.test(c.name) && !c.httpOnly ? "HttpOnly" : "",
    ].filter(Boolean);
    const issues = (list: typeof cookies) =>
      list.map((c) => ({ c, flags: missing(c) })).filter((x) => x.flags.length).map(({ c, flags }) => `${c.name}: missing ${flags.join(", ")}`);
    // Cookies of other sites (embeds, ads) can only be fixed by their vendor.
    const own = issues(cookies.filter((c) => !ctx.isThirdParty(c.domain)));
    const foreign = issues(cookies.filter((c) => ctx.isThirdParty(c.domain))).map((i) => `${i} (set by another site, the site cannot change it)`);
    if (own.length) return warn(`${own.length} of ${cookies.length} cookie(s) lack security flags.`, [...own, ...foreign]);
    if (foreign.length) return info(`Only cookies of other sites lack security flags.`, foreign);
    return pass(`All ${cookies.length} cookie(s) have the expected flags.`);
  },
});
