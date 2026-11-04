import { defineCheck, isWebUrl, msg, pass, skip, warn, type Finding } from "../../../src/sdk.ts";

// Login forms reuse data the person gave before; they need no new notice.
// Host a form sends to; none for an empty or javascript: action.
const hostOf = (action: string) => {
  try {
    return isWebUrl(action) ? new URL(action).hostname : undefined;
  } catch {
    return undefined;
  }
};
const isLogin = (fields: string[]) => fields.length <= 2 && fields.some((f) => f.startsWith("password:"));

export default defineCheck({
  run(ctx) {
    const forms = ctx.sitePages.flatMap((p) =>
      p.js.forms.filter((f) => f.personal && !isLogin(f.fields)).map((f) => ({ ...f, page: ctx.short(p.url) })),
    );
    if (!forms.length) return skip(msg("no_forms"));
    const missing = forms
      .filter((f) => !ctx.links("privacy", f.links).length && !ctx.says("privacy", f.text))
      .map((f): Finding => {
        const host = hostOf(f.action);
        const params = { page: f.page, fields: f.fields.join(", ") };
        return host && ctx.isThirdParty(host) ? { key: "form_to", params: { ...params, host } } : { key: "form", params };
      });
    if (missing.length) return warn(msg("missing", { missing: missing.length, count: forms.length }), missing);
    return pass(msg("all", { count: forms.length }));
  },
});
