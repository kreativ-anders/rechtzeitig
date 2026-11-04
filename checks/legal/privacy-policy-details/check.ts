import { defineCheck, msg, needLegalPage, pass, warn } from "../../../src/sdk.ts";

// Concepts in lang/*.yml `text` for what Art. 13 GDPR asks for; the message `topic_<concept>` names each.
const TOPICS = [
  "controller",
  "legal_basis",
  "storage_period",
  "right_access",
  "right_rectification",
  "right_erasure",
  "right_restriction",
  "right_portability",
  "right_objection",
  "withdraw_consent",
  "right_complaint",
];

export default defineCheck({
  run(ctx) {
    const page = needLegalPage(ctx, "privacy");
    if ("status" in page) return page;
    const missing = TOPICS.filter((concept) => !ctx.says(concept, page.js.text)).map((concept) => ({ key: `topic_${concept}` }));
    if (missing.length) return warn(msg("missing", { missing: missing.length, count: TOPICS.length }), missing);
    return pass(msg("complete", { count: TOPICS.length }));
  },
});
