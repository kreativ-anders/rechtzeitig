import type { BrowserContext } from "playwright";
import { timeoutAfter } from "./deadline.ts";
import { normalize } from "./text.ts";
import type { Area, Checkbox, Form, Link, Snapshot } from "./sdk.ts";

interface RawLink {
  href: string | null;
  text: string;
  extra: string;
  area: Area;
  button: boolean;
}

interface RawForm {
  action: string;
  fields: string[];
  personal: boolean;
  links: RawLink[];
  text: string;
}

interface Dom {
  lang: string;
  meta: Record<string, string>;
  text: string;
  links: RawLink[];
  forms: RawForm[];
  checkboxes: Checkbox[];
}

// Runs inside the page. Works with JavaScript off too, because Playwright evaluates in its own world.
// Everything it needs must be defined inside this function.
function readDom(): Dom {
  // Caps, so a hostile page cannot fill the runner's memory or the report.
  const MAX = { text: 200_000, label: 300, links: 2000, forms: 50, checkboxes: 500 };
  const PERSONAL = /mail|name|phone|tel|address|adresse|street|strasse|zip|plz|birth|geburt/i;
  // querySelectorAll that also looks into open shadow roots, where many consent banners live.
  const all = (root: Document | ShadowRoot, selector: string): Element[] => {
    const found = Array.from(root.querySelectorAll(selector));
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.shadowRoot) found.push(...all(el.shadowRoot, selector));
    }
    return found;
  };
  const BANNER = "dialog,[role=dialog],[role=alertdialog],[aria-modal=true],[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=gdpr i],[class*=gdpr i],[id*=cmp i]";
  const areaOf = (el: Element): Area =>
    el.closest(BANNER) || el.getRootNode() instanceof ShadowRoot ? "banner"
    : el.closest("footer,[role=contentinfo]") ? "footer"
    : el.closest("nav,[role=navigation]") ? "nav"
    : el.closest("header,[role=banner]") ? "header"
    : el.closest("main,[role=main]") ? "main"
    : "other";
  const toRaw = (el: Element): RawLink => {
    const isLink = el instanceof HTMLAnchorElement;
    const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || el.textContent || "").trim().slice(0, MAX.label);
    const alts = Array.from(el.querySelectorAll("img[alt]")).map((img) => img.getAttribute("alt"));
    const extra = [el.getAttribute("aria-label"), el.getAttribute("title"), ...alts].filter(Boolean).join(" ").slice(0, MAX.label);
    return { href: isLink ? (el as HTMLAnchorElement).href : null, text, extra, area: areaOf(el), button: !isLink };
  };
  const LINKS = "a[href], button, [role=button], input[type=submit], input[type=button]";

  const forms = Array.from(document.forms).slice(0, MAX.forms).map((form): RawForm => {
    const fields = Array.from(form.elements)
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      .filter((el) => !["hidden", "submit", "button", "checkbox", "radio"].includes(el.type))
      .map((el) => `${el.type}:${el.name || el.id || el.getAttribute("autocomplete") || ""}`);
    // The form and its direct container; never the whole page.
    const around = form.parentElement && form.parentElement !== document.body ? form.parentElement : form;
    return {
      action: form.action,
      fields,
      personal: fields.some((f) => f.startsWith("email:") || f.startsWith("tel:") || PERSONAL.test(f.split(":")[1])),
      links: Array.from(around.querySelectorAll(LINKS)).slice(0, MAX.links).map(toRaw),
      text: ((around as HTMLElement).innerText ?? "").slice(0, 3000),
    };
  });

  const checkboxes = all(document, "input[type=checkbox]").slice(0, MAX.checkboxes).map((el) => {
    const box = el as HTMLInputElement;
    const label = box.labels?.[0]?.innerText || box.closest("label")?.innerText || box.getAttribute("aria-label") || box.parentElement?.textContent || "";
    return { label: label.trim().slice(0, 200), checked: box.checked, disabled: box.disabled };
  });

  // Header equivalents in <meta>. name="referrer" is stored as referrer-policy, like the header.
  const meta: Record<string, string> = {};
  for (const el of all(document, "meta[http-equiv], meta[name=referrer i]")) {
    const name = el.getAttribute("http-equiv")?.toLowerCase() || "referrer-policy";
    meta[name] ??= el.getAttribute("content") ?? "";
  }

  return {
    lang: document.documentElement.getAttribute("lang") ?? "",
    meta,
    text: (document.body?.innerText ?? "").slice(0, MAX.text),
    links: all(document, LINKS).slice(0, MAX.links).map(toRaw),
    forms,
    checkboxes,
  };
}

function toLink(raw: RawLink): Link {
  let path = "";
  if (raw.href) {
    try {
      path = decodeURIComponent(new URL(raw.href).pathname).replace(/[-_/.]+/g, " ");
    } catch {
      // keep empty path for unusual hrefs
    }
  }
  return {
    href: raw.href && /^(https?|mailto):/.test(raw.href) ? raw.href : null,
    text: raw.text,
    label: normalize(`${raw.text} ${raw.extra} ${path}`),
    area: raw.area,
    button: raw.button,
  };
}

const toForm = (raw: RawForm): Form => ({ ...raw, links: raw.links.map(toLink) });

const IDLE = 5000;
const MAX_REQUESTS = 5000;
const EMPTY = { headers: {}, meta: {}, lang: "", text: "", links: [], forms: [], checkboxes: [], cookies: [], storage: [] };

/** Loads a URL once in the given browser context and records what a visitor gets without clicking anything. */
export async function capture(context: BrowserContext, url: string, js: boolean, timeout: number): Promise<Snapshot> {
  const page = await context.newPage();
  const requests: Snapshot["requests"] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && requests.length < MAX_REQUESTS) requests.push({ url: u, host: new URL(u).hostname, type: r.resourceType() });
  });
  const cookieKey = (c: { name: string; domain: string }) => `${c.name}@${c.domain}`;
  const before = new Set((await context.cookies()).map(cookieKey));
  const load = async (): Promise<Snapshot> => {
    const response = await page.goto(url, { waitUntil: "load", timeout });
    if (js) await page.waitForLoadState("networkidle", { timeout: IDLE }).catch(() => {});
    const dom = await page.evaluate(readDom);
    const storage = js
      ? await page.evaluate(() => {
          try {
            return Object.keys(localStorage);
          } catch {
            return [];
          }
        })
      : [];
    // Only cookies this load added; the context keeps cookies from earlier pages.
    const cookies = (await context.cookies())
      .filter((c) => !before.has(cookieKey(c)))
      .map((c) => ({ name: c.name, domain: c.domain.replace(/^\./, ""), secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite }));
    return {
      status: response?.status() ?? 0,
      finalUrl: page.url(),
      headers: response?.headers() ?? {},
      meta: dom.meta,
      lang: dom.lang,
      text: dom.text,
      links: dom.links.map(toLink),
      forms: dom.forms.map(toForm),
      checkboxes: dom.checkboxes,
      requests,
      cookies,
      storage,
    };
  };
  // page.evaluate has no timeout: a page that never yields (while (true) {}) would block the scan forever.
  const [deadline, stop] = timeoutAfter(2 * timeout + IDLE, "page did not finish loading in time");
  try {
    return await Promise.race([load(), deadline]);
  } catch (e) {
    return { ...EMPTY, status: 0, error: (e as Error).message.split("\n")[0], finalUrl: url, requests: [...requests] };
  } finally {
    stop();
    await page.close().catch(() => {});
  }
}
