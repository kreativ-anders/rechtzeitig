import { defineCheck, info, loadYaml, msg, pass, siteCookies, skip, warn, type Cookie, type Finding, type Msg } from "../../../src/sdk.ts";

const NAMES = loadYaml<{ session: string[]; read_by_script: string[] }>("data/cookies.yml");
const SESSION = new RegExp(NAMES.session.join("|"), "i");
const READ_BY_SCRIPT = new RegExp(NAMES.read_by_script.join("|"), "i");

export default defineCheck({
  run(ctx) {
    const cookies = siteCookies(ctx);
    if (!cookies.length) return skip(msg("none"));
    const missing = (c: Cookie) => [
      !c.secure && c.sameSite === "None" ? msg("secure_samesite") : !c.secure && ctx.https ? "Secure" : "",
      SESSION.test(c.name) && !READ_BY_SCRIPT.test(c.name) && !c.httpOnly ? "HttpOnly" : "",
    ].filter((f): f is string | Msg => !!f);
    const flagList = ([first, second]: Array<string | Msg>) => (second ? msg("two_flags", { first, second }) : first);
    const issues = (list: typeof cookies, key: string): Finding[] =>
      list.map((c) => ({ c, flags: missing(c) })).filter((x) => x.flags.length)
        .map(({ c, flags }) => ({ key, params: { name: c.name, flags: flagList(flags) } }));
    // Cookies of other sites (embeds, ads) can only be fixed by their vendor.
    const own = issues(cookies.filter((c) => !ctx.isThirdParty(c.domain)), "missing");
    const foreign = issues(cookies.filter((c) => ctx.isThirdParty(c.domain)), "missing_foreign");
    if (own.length) return warn(msg("lack_flags", { count: own.length, total: cookies.length }), [...own, ...foreign]);
    if (foreign.length) return info(msg("only_foreign"), foreign);
    return pass(msg("all_set", { count: cookies.length }));
  },
});
