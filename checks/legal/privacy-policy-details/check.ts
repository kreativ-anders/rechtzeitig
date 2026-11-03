import { defineCheck, needLegalPage, pass, warn } from "../../../src/sdk.ts";

// Concept in lang/*.yml `text` → what Art. 13 GDPR asks for.
const TOPICS: Array<[string, string]> = [
  ["controller", "Controller and contact details (Art. 13(1)(a))"],
  ["legal_basis", "Legal basis of each processing (Art. 13(1)(c))"],
  ["storage_period", "Storage period (Art. 13(2)(a))"],
  ["right_access", "Right of access (Art. 15)"],
  ["right_rectification", "Right to rectification (Art. 16)"],
  ["right_erasure", "Right to erasure (Art. 17)"],
  ["right_restriction", "Right to restriction of processing (Art. 18)"],
  ["right_portability", "Right to data portability (Art. 20)"],
  ["right_objection", "Right to object (Art. 21)"],
  ["withdraw_consent", "Right to withdraw consent (Art. 7(3)), needed if you ask for consent"],
  ["right_complaint", "Right to lodge a complaint with a supervisory authority (Art. 77)"],
];

export default defineCheck({
  run(ctx) {
    const page = needLegalPage(ctx, "privacy");
    if ("status" in page) return page;
    const missing = TOPICS.filter(([concept]) => !ctx.says(concept, page.js.text)).map(([, label]) => label);
    if (missing.length) return warn(`${missing.length} of ${TOPICS.length} required topics not found.`, missing);
    return pass(`All ${TOPICS.length} required topics found.`);
  },
});
