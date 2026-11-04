import { chromium, type Browser } from "playwright";
import { createContext } from "./context.ts";
import { crawl } from "./crawl.ts";
import { loadLanguages, resolveLanguages } from "./lang.ts";
import { loadRegistry } from "./registry.ts";
import { loadYaml, type ScanContext } from "./sdk.ts";
import { errorMessage } from "./text.ts";

/** From package.json (YAML reads JSON too). */
export const VERSION = loadYaml<{ version: string }>("package.json").version;
const HOMEPAGE = "https://github.com/kreativ-anders/rechtzeitig";

export interface ScanOptions {
  /** "de", "en", "all" or a comma list. */
  language?: string;
  subscriptions?: boolean;
  sales?: boolean;
  maxPages?: number;
  timeout?: number;
  offline?: boolean;
  ipinfoToken?: string;
  /** Start Chrome without its sandbox where the runner has none. */
  unsandboxed?: boolean;
  /** Reuse a running browser (tests). */
  browser?: Browser;
  /** Called with problems that do not stop the scan, for the report. */
  onWarning?: (message: string) => void;
}

// The browser gets only these variables, never tokens from the workflow (IPINFO_TOKEN, GITHUB_TOKEN, ...).
const BROWSER_ENV = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "DISPLAY", "XDG_RUNTIME_DIR", "SystemRoot", "LOCALAPPDATA"];

/**
 * Starts Chromium with its sandbox. Where the runner cannot sandbox, it stops, unless `unsandboxed`
 * allows a start without (input require-sandbox: false), which the report then warns about.
 */
export async function launchBrowser(onWarning: (message: string) => void = () => {}, unsandboxed = false): Promise<Browser> {
  const env = Object.fromEntries(BROWSER_ENV.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]!]));
  try {
    return await chromium.launch({ env, chromiumSandbox: true });
  } catch (e) {
    if (!unsandboxed) throw new Error(`Chrome cannot start with its sandbox on this runner (${errorMessage(e)}). Only for sites you trust: require-sandbox: false scans without it.`);
    onWarning(`Chrome sandbox not available on this runner, scanning without it (${errorMessage(e)})`);
    return chromium.launch({ env, chromiumSandbox: false });
  }
}

export async function scan(url: string, opts: ScanOptions = {}): Promise<ScanContext> {
  const languages = resolveLanguages(opts.language ?? "de");
  const lang = loadLanguages(languages);
  const browser = opts.browser ?? (await launchBrowser(opts.onWarning, opts.unsandboxed));
  try {
    const chrome = browser.version().split(".")[0];
    const userAgent =
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Safari/537.36 ` +
      `rechtzeitig/${VERSION} (+${HOMEPAGE})`;
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
