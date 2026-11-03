import { chromium, type Browser } from "playwright";
import { createContext } from "./context.ts";
import { crawl } from "./crawl.ts";
import { loadLanguages, resolveLanguages } from "./lang.ts";
import { loadRegistry } from "./registry.ts";
import type { ScanContext } from "./sdk.ts";

export const VERSION = "0.1.0";
export const HOMEPAGE = "https://github.com/kreativ-anders/vibecoda";

export interface ScanOptions {
  /** "de", "en", "all" or a comma list. */
  language?: string;
  subscriptions?: boolean;
  sales?: boolean;
  maxPages?: number;
  timeout?: number;
  offline?: boolean;
  ipinfoToken?: string;
  /** Reuse a running browser (tests). */
  browser?: Browser;
}

export async function scan(url: string, opts: ScanOptions = {}): Promise<ScanContext> {
  const languages = resolveLanguages(opts.language ?? "de");
  const lang = loadLanguages(languages);
  const browser = opts.browser ?? (await chromium.launch());
  try {
    const chrome = browser.version().split(".")[0];
    const userAgent =
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Safari/537.36 ` +
      `vibecoda/${VERSION} (+${HOMEPAGE})`;
    const data = await crawl(url, {
      browser,
      lang,
      userAgent,
      maxPages: opts.maxPages ?? 10,
      timeout: opts.timeout ?? 20_000,
      offline: opts.offline,
      ipinfoToken: opts.ipinfoToken,
    });
    return createContext(data, lang, loadRegistry(), { languages, subscriptions: opts.subscriptions ?? false, sales: opts.sales ?? false });
  } finally {
    if (!opts.browser) await browser.close();
  }
}
