import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { BrowserContext, Page as PlaywrightPage, Request as PlaywrightRequest } from "playwright";
import { loadYaml } from "./data.ts";
import { timeoutAfter } from "./deadline.ts";
import { errorMessage, isWebUrl, normalize } from "./text.ts";
import { cookieKey, type Area, type Checkbox, type Form, type Image, type Link, type Request, type Snapshot, type Style, type AxeViolation, type Subresource, type Video } from "./sdk.ts";

interface RawLink {
  href: string | null;
  text: string;
  extra: string;
  area: Area;
  button: boolean;
  style?: Style;
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
  subresources: Subresource[];
  images: Image[];
  videos: Video[];
  struck: string[];
}

// Runs inside the page. Works with JavaScript off too, because Playwright evaluates in its own world.
// Everything it needs must be defined inside this function.
function readDom(): Dom {
  // Caps, so a hostile page cannot fill the runner's memory or the report.
  const MAX = { text: 200_000, label: 300, links: 2000, forms: 50, checkboxes: 500, resources: 500, url: 2000, struck: 100 };
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
  // Size and colors as rendered. The background is the first non-transparent one up the tree, through shadow hosts.
  const transparent = (c: string) => c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
  const styleOf = (el: Element): Style => {
    const box = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    let background = "rgb(255, 255, 255)";
    for (let node: Element | null = el; node; ) {
      const c = getComputedStyle(node).backgroundColor;
      if (!transparent(c)) {
        background = c;
        break;
      }
      const root = node.getRootNode();
      node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    return { width: Math.round(box.width), height: Math.round(box.height), fontSize: parseFloat(css.fontSize) || 0, color: css.color, background };
  };
  const urlOf = (value: string | null): string => {
    try {
      return value ? new URL(value, document.baseURI).href.slice(0, MAX.url) : "";
    } catch {
      return "";
    }
  };
  const toRaw = (el: Element): RawLink => {
    const isLink = el instanceof HTMLAnchorElement;
    const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || el.textContent || "").trim().slice(0, MAX.label);
    const alts = Array.from(el.querySelectorAll("img[alt]")).map((img) => img.getAttribute("alt"));
    const extra = [el.getAttribute("aria-label"), el.getAttribute("title"), ...alts].filter(Boolean).join(" ").slice(0, MAX.label);
    const area = areaOf(el);
    const raw: RawLink = { href: isLink ? (el as HTMLAnchorElement).href : null, text, extra, area, button: !isLink };
    if (area === "banner") raw.style = styleOf(el);
    return raw;
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

  // Struck-through short texts with a digit: old prices next to a reduced one. <del>, <s>, <strike> or CSS line-through.
  const struck: string[] = [];
  for (const el of all(document, "body *")) {
    if (struck.length >= MAX.struck) break;
    // Cheap tests first; innerText and computed style only for short texts with a digit.
    const raw = el.textContent ?? "";
    if (raw.length > 80 || !/\d/.test(raw) || el.childElementCount > 2) continue;
    const tag = el.tagName.toLowerCase();
    if (!["del", "s", "strike"].includes(tag) && !getComputedStyle(el).textDecorationLine.includes("line-through")) continue;
    const text = ((el as HTMLElement).innerText ?? raw).trim();
    if (text) struck.push(text.slice(0, 40));
  }

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
    struck: [...new Set(struck)],
    subresources: all(document, "script[src], link[rel~=stylesheet i][href]").slice(0, MAX.resources).map((el) => ({
      url: urlOf(el.getAttribute(el.tagName === "SCRIPT" ? "src" : "href")),
      type: el.tagName === "SCRIPT" ? "script" as const : "stylesheet" as const,
      integrity: !!el.getAttribute("integrity")?.trim(),
    })),
    images: all(document, "img").slice(0, MAX.resources).map((el) => {
      const img = el as HTMLImageElement;
      const box = img.getBoundingClientRect();
      return {
        url: urlOf(img.currentSrc || img.getAttribute("src")),
        loading: (img.getAttribute("loading") ?? "").toLowerCase(),
        belowFold: box.top + window.scrollY >= window.innerHeight,
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }),
    videos: all(document, "video").slice(0, MAX.resources).map((el) => {
      const video = el as HTMLVideoElement;
      return {
        url: urlOf(video.currentSrc || video.getAttribute("src") || video.querySelector("source")?.getAttribute("src") || null),
        autoplay: video.hasAttribute("autoplay"),
        muted: video.hasAttribute("muted") || video.muted,
        controls: video.hasAttribute("controls"),
        loop: video.hasAttribute("loop"),
      };
    }),
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
    ...(raw.style && { style: raw.style }),
  };
}

const toForm = (raw: RawForm): Form => ({ ...raw, links: raw.links.map(toLink) });

// ---------- axe-core

const AXE_RULES = [...new Set(Object.values(loadYaml<{ rules: Record<string, string[]> }>("data/accessibility.yml").rules).flat())];
const AXE = loadYaml<{ axe: { timeout_ms: number; max_targets: number } }>("data/thresholds.yml").axe;
let axeSource: string | undefined;
// axe-core's own build, unchanged, with its license header. Read once, on the first page that needs it.
const axeScript = () => (axeSource ??= readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"));

/**
 * Runs the selected axe-core rules in the page and returns their violations, or undefined when axe
 * failed or ran out of time. page.evaluate is not bound by the page's CSP and loads nothing from the
 * network. The page can tamper with what axe returns, so every value is checked and capped here.
 */
async function runAxe(page: PlaywrightPage, ms: number): Promise<AxeViolation[] | undefined> {
  const options = {
    runOnly: { type: "rule", values: AXE_RULES },
    resultTypes: ["violations"],
    iframes: false,
    elementRef: false,
    ancestry: false,
    xpath: false,
    performanceTimer: false,
  };
  const script = `(async () => {\n${axeScript()}\n;const r = await axe.run(document, ${JSON.stringify(options)});
    return r.violations.map((v) => ({ rule: v.id, count: v.nodes.length, targets: v.nodes.slice(0, ${AXE.max_targets}).map((n) => n.target.join(" ")) }));
  })()`;
  const [deadline, stop] = timeoutAfter(ms, "axe-core did not finish in time");
  try {
    const raw: unknown = await Promise.race([page.evaluate(script), deadline]);
    if (!Array.isArray(raw)) return undefined;
    return raw
      .filter((v) => v && AXE_RULES.includes(v.rule) && Number.isFinite(v.count) && Array.isArray(v.targets))
      .slice(0, AXE_RULES.length)
      .map((v) => ({
        rule: String(v.rule),
        count: Math.max(0, Math.round(v.count)),
        targets: v.targets.slice(0, AXE.max_targets).map((t: unknown) => String(t).slice(0, 300)),
      }));
  } catch {
    return undefined;
  } finally {
    stop();
  }
}

const IDLE = 5000;
const MAX_REQUESTS = 5000;

/** A load that got nothing: status 0, no content. */
export const emptySnapshot = (finalUrl: string): Snapshot => ({
  status: 0, finalUrl, headers: {}, meta: {}, lang: "", text: "", links: [], forms: [], checkboxes: [], struck: [], requests: [], cookies: [], storage: [], subresources: [], images: [], videos: [],
});

/**
 * Loads a URL once in the given browser context and records what a visitor gets without clicking anything.
 * `idle` is the longest wait for the network to settle after load; tests shorten it to reach the deadline sooner.
 */
export async function capture(context: BrowserContext, url: string, js: boolean, timeout: number, idle = IDLE): Promise<Snapshot> {
  const page = await context.newPage();
  // With the cache off, every page answers with its own headers, and checks see each file as a first visit would.
  await context.newCDPSession(page).then((cdp) => cdp.send("Network.setCacheDisabled", { cacheDisabled: true })).catch(() => {});
  const requests: Snapshot["requests"] = [];
  const pending = new Map<PlaywrightRequest, Request>();
  page.on("request", (r) => {
    const u = r.url();
    if (!isWebUrl(u) || requests.length >= MAX_REQUESTS) return;
    const entry: Request = { url: u, host: new URL(u).hostname, type: r.resourceType() };
    requests.push(entry);
    pending.set(r, entry);
  });
  page.on("response", (res) => {
    const entry = pending.get(res.request());
    if (!entry) return;
    pending.delete(res.request());
    const h = res.headers();
    entry.status = res.status();
    if (h["content-type"]) entry.contentType = h["content-type"];
    if (h["cache-control"]) entry.cacheControl = h["cache-control"];
    if (h["expires"]) entry.expires = h["expires"];
    if (h["content-encoding"]) entry.contentEncoding = h["content-encoding"].toLowerCase();
    const length = Number(h["content-length"]);
    if (h["content-length"] && Number.isFinite(length)) entry.contentLength = length;
  });
  const before = new Set((await context.cookies()).map(cookieKey));
  const load = async (): Promise<Snapshot> => {
    const response = await page.goto(url, { waitUntil: "load", timeout });
    if (js) await page.waitForLoadState("networkidle", { timeout: idle }).catch(() => {});
    const dom = await page.evaluate(readDom);
    const axe = js ? await runAxe(page, Math.min(AXE.timeout_ms, timeout)) : undefined;
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
      .map((c) => ({ name: c.name, domain: c.domain.replace(/^\./, ""), secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expires: c.expires }));
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
      struck: dom.struck,
      requests,
      cookies,
      storage,
      subresources: dom.subresources,
      images: dom.images,
      videos: dom.videos,
      ...(axe && { axe }),
    };
  };
  // page.evaluate has no timeout: a page that never yields (while (true) {}) would block the scan forever.
  const [deadline, stop] = timeoutAfter(2 * timeout + idle + (js ? Math.min(AXE.timeout_ms, timeout) : 0), "page did not finish loading in time");
  try {
    return await Promise.race([load(), deadline]);
  } catch (e) {
    return { ...emptySnapshot(url), error: errorMessage(e), requests: [...requests] };
  } finally {
    stop();
    await page.close().catch(() => {});
  }
}
