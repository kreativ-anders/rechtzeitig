import { defineCheck, fail, jsFailedPages, msg, pass, thirdPartyServices, warn, type Finding, type Service } from "../../../src/sdk.ts";

export default defineCheck({
  run(ctx) {
    const services = [...thirdPartyServices(ctx).values()];
    const line = (s: Service): Finding => {
      const params = { name: s.name, hosts: [...s.hosts].join(", "), pages: [...s.pages].join(", ") };
      return s.vendor?.advice ? { key: "service_advice", params: { ...params, advice: s.vendor.advice } } : { key: "service", params };
    };
    const needConsent = services.filter((s) => s.vendor?.consent === "required");
    const others = services.filter((s) => s.vendor?.consent !== "required");
    const details = [...needConsent, ...others].map(line);
    const names = (list: Service[]) => list.map((s) => s.name).join(", ");

    if (needConsent.length) return fail(msg("consent_required", { names: names(needConsent) }), details);
    if (others.length) return warn(msg("check_basis", { names: names(others) }), details);
    // Without the load with JavaScript, requests made by scripts are unknown: no pass on missing evidence.
    if (ctx.jsFailed.length) return warn(msg("incomplete", { count: ctx.jsFailed.length }), jsFailedPages(ctx));
    return pass(msg("none"));
  },
});
