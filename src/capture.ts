import type { BrowserContext } from "playwright";
import { normalize } from "./text.ts";
import type { Area, Link, Snapshot } from "./sdk.ts";

interface RawLink {
  href: string | null;
  text: string;
  extra: string;
  area: Area;
  button: boolean;
}

// Runs inside the page. Works with JavaScript off too, because Playwright evaluates in its own world.
function readDom(): { lang: string; text: string; links: RawLink[] } {
  const areaOf = (el: Element): Area =>
    el.closest("footer,[role=contentinfo]") ? "footer"
    : el.closest("nav,[role=navigation]") ? "nav"
    : el.closest("header,[role=banner]") ? "header"
    : el.closest("main,[role=main]") ? "main"
    : "other";
  const elements = document.querySelectorAll("a[href], button, [role=button], input[type=submit], input[type=button]");
  const links: RawLink[] = [];
  for (const el of Array.from(elements)) {
    const isLink = el instanceof HTMLAnchorElement;
    const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || "").trim();
    const alts = Array.from(el.querySelectorAll("img[alt]")).map((img) => img.getAttribute("alt"));
    const extra = [el.getAttribute("aria-label"), el.getAttribute("title"), ...alts].filter(Boolean).join(" ");
    links.push({ href: isLink ? (el as HTMLAnchorElement).href : null, text, extra, area: areaOf(el), button: !isLink });
  }
  return {
    lang: document.documentElement.getAttribute("lang") ?? "",
    text: document.body?.innerText ?? "",
    links,
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
    href: raw.href && /^https?:/.test(raw.href) ? raw.href : null,
    text: raw.text,
    label: normalize(`${raw.text} ${raw.extra} ${path}`),
    area: raw.area,
    button: raw.button,
  };
}

/** Loads a URL once in the given browser context and records what a visitor gets without clicking anything. */
export async function capture(context: BrowserContext, url: string, js: boolean, timeout: number): Promise<Snapshot> {
  const page = await context.newPage();
  const requests: Snapshot["requests"] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/^https?:/.test(u)) requests.push({ url: u, host: new URL(u).hostname, type: r.resourceType() });
  });
  const cookieKey = (c: { name: string; domain: string }) => `${c.name}@${c.domain}`;
  const before = new Set((await context.cookies()).map(cookieKey));
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout });
    if (js) await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
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
      .map((c) => ({ name: c.name, domain: c.domain.replace(/^\./, "") }));
    return {
      status: response?.status() ?? 0,
      finalUrl: page.url(),
      headers: response?.headers() ?? {},
      lang: dom.lang,
      text: dom.text,
      links: dom.links.map(toLink),
      requests,
      cookies,
      storage,
    };
  } catch (e) {
    return {
      status: 0,
      error: (e as Error).message.split("\n")[0],
      finalUrl: url,
      headers: {},
      lang: "",
      text: "",
      links: [],
      requests,
      cookies: [],
      storage: [],
    };
  } finally {
    await page.close();
  }
}
