import { defineCheck, fail, loadedPage, pass, skip, warn } from "../../../src/sdk.ts";

// Formats from German law, so they do not depend on the page language.
const EMAIL = /[\w.+-]+\s*(@|[[(]\s*at\s*[\])])\s*[\w-]+(\.[\w-]+)*\.[a-z]{2,}/i;
const PHONE = /(\+|00)\s?\d{2}[\d\s/().-]{6,}\d|\b0\d{2,5}[\s/-]*\d[\d\s-]{4,}\d/;
const POSTCODE = /\b(D-?\s?)?\d{5}\s+\p{Lu}/u;
const VAT_ID = /\bDE\s?\d{9}\b/;
const REGISTER = /\b(HRB|HRA|VR|PR|GnR|GsR)\s?\d+/;

export default defineCheck({
  title: "Imprint contains the required details",
  law: "§ 5 Abs. 1 DDG",
  run(ctx) {
    const page = loadedPage(ctx, "imprint");
    if (!page) return skip("No imprint to read (see legal/imprint).");
    const text = page.js.text;
    const hasEmail = EMAIL.test(text) || page.js.links.some((l) => l.href?.startsWith("mailto:"));
    const missing: string[] = [];
    if (!POSTCODE.test(text)) missing.push("No postal address with a German postcode found (Nr. 1).");
    if (!PHONE.test(text) && !ctx.says("contact_form", text)) {
      missing.push("No phone number or contact form found. Besides email, a second fast way of contact is required (Nr. 2).");
    }
    const optional = [
      VAT_ID.test(text) ? "VAT ID (USt-IdNr.) found." : "No VAT ID (USt-IdNr.) found. Required if you have one (Nr. 6).",
      REGISTER.test(text) ? "Register entry found." : "No register entry (HRB, VR, ...) found. Required if registered (Nr. 4).",
    ];

    if (!hasEmail) return fail("The imprint has no email address (Nr. 2).", [...missing, ...optional]);
    if (missing.length) return warn(`The imprint may be incomplete: ${missing.length} item(s) not found.`, [...missing, ...optional]);
    return pass("Address, email and a second way of contact found in the imprint.", optional);
  },
});
