import { defineCheck, pass, skip, warn } from "../../../src/sdk.ts";

// Login forms reuse data the person gave before; they need no new notice.
// Host a form sends to; none for an empty or javascript: action.
const hostOf = (action: string) => {
  try {
    return /^https?:/i.test(action) ? new URL(action).hostname : undefined;
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
    if (!forms.length) return skip("No form that asks for personal data.");
    const missing = forms
      .filter((f) => !ctx.links("privacy", f.links).length && !ctx.says("privacy", f.text))
      .map((f) => {
        const host = hostOf(f.action);
        return `${f.page}: form with ${f.fields.join(", ")}${host && ctx.isThirdParty(host) ? `, sends to ${host}` : ""}`;
      });
    if (missing.length) {
      return warn(`${missing.length} of ${forms.length} form(s) ask for personal data without a privacy notice next to them.`, missing);
    }
    return pass(`All ${forms.length} form(s) point to the privacy policy.`);
  },
});
