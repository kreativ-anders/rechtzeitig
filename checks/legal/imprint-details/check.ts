import { defineCheck, fail, msg, needLegalPage, pass, warn, type Finding } from "../../../src/sdk.ts";

// Formats from German law, so they do not depend on the page language.
const EMAIL = /[\w.+-]+\s*(@|[[(]\s*at\s*[\])])\s*[\w-]+(\.[\w-]+)*\.[a-z]{2,}/i;
const PHONE = /(\+|00)\s?\d{2}[\d\s/().-]{6,}\d|\b0\d{2,5}[\s/-]*\d[\d\s-]{4,}\d/;
// Five digits, but not the number of a register entry ("HRB 12345 Amtsgericht").
const POSTCODE = /(?<!\b(HRB|HRA|VR|PR|GnR|GsR)\s?)\b(D-?\s?)?\d{5}\s+\p{Lu}/u;
const VAT_ID = /\bDE\s?\d{9}\b/;
const REGISTER = /\b(HRB|HRA|VR|PR|GnR|GsR)\s?\d+/;
// Removed before looking for a phone number: its digit groups look like one.
const IBAN = /\b[A-Z]{2}\d{2}(\s?[\dA-Z]{4}){2,7}(\s?[\dA-Z]{1,3})?\b/g;

export default defineCheck({
  run(ctx) {
    const page = needLegalPage(ctx, "imprint");
    if ("status" in page) return page;
    const text = page.js.text;
    const hasEmail = EMAIL.test(text) || page.js.links.some((l) => l.href?.startsWith("mailto:"));
    const missing: Finding[] = [];
    if (!POSTCODE.test(text)) missing.push({ key: "no_address" });
    if (!PHONE.test(text.replace(IBAN, " ")) && !ctx.says("contact_form", text)) missing.push({ key: "no_second_contact" });
    const optional: Finding[] = [
      { key: VAT_ID.test(text) ? "vat_id" : "no_vat_id" },
      { key: REGISTER.test(text) ? "register" : "no_register" },
    ];

    if (!hasEmail) return fail(msg("no_email"), [...missing, ...optional]);
    if (missing.length) return warn(msg("incomplete", { count: missing.length }), [...missing, ...optional]);
    return pass(msg("complete"), optional);
  },
});
