// Network lookups without a browser: probe paths, plain HTTP, the www variant, TLS, DNS and IP countries.

import { readFileSync } from "node:fs";
import { connect } from "node:tls";
import { lookup, resolveMx, resolveTxt } from "node:dns/promises";
import { parse } from "yaml";
import { assertPublicHost, BlockedHostError, fetchPublic } from "./net.ts";
import { siteOf } from "./text.ts";
import type { Probe, ScanContext } from "./sdk.ts";

const PROBES = parse(readFileSync(new URL("../data/probes.yml", import.meta.url), "utf8")) as Array<{
  path: string;
  kind: "file" | "error";
  expect?: string;
}>;
const MAX_BODY = 50_000;
const MAX_REDIRECTS = 10;

// `trusted` in the functions below is the host the user asked to scan; see src/net.ts.

/** Fetches every path in data/probes.yml from the site's origin. */
export async function probe(origin: string, userAgent: string, timeout: number, trusted?: string): Promise<Probe[]> {
  return Promise.all(
    PROBES.map(async ({ path, kind, expect }) => {
      try {
        const { res } = await fetchPublic(new URL(path, origin), { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(timeout) }, trusted);
        const body = await readCapped(res, MAX_BODY);
        const headers = Object.fromEntries(res.headers);
        const exposed = kind === "file" && res.status === 200 && !!expect && new RegExp(expect, "m").test(body);
        return { path, kind, status: res.status, headers, body, exposed };
      } catch {
        return { path, kind, status: 0, headers: {}, body: "", exposed: false };
      }
    }),
  );
}

/** Reads at most `max` bytes of a response body, then stops the download. */
export async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}

export async function plainHttp(url: string, timeout: number, trusted?: string): Promise<ScanContext["http"]> {
  const u = new URL(url);
  if (u.protocol !== "https:") return undefined;
  u.protocol = "http:";
  try {
    const { res } = await fetchPublic(u, { signal: AbortSignal.timeout(timeout) }, trusted);
    await res.body?.cancel();
    return { status: res.status, location: res.headers.get("location") ?? "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Requests the host with "www." added or removed and follows redirects, checking every hop. */
export async function hostVariant(url: string, timeout: number): Promise<ScanContext["variant"]> {
  const u = new URL(url);
  if (/^[\d.]+$/.test(u.hostname) || u.hostname === "localhost") return undefined;
  u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
  u.pathname = "/";
  try {
    await lookup(u.hostname);
  } catch {
    return undefined; // variant does not exist, nothing to check
  }
  try {
    const { res, url: finalUrl } = await fetchPublic(u, { signal: AbortSignal.timeout(timeout) }, undefined, MAX_REDIRECTS);
    await res.body?.cancel();
    return { url: u.href, status: res.status, finalUrl };
  } catch (e) {
    if (e instanceof BlockedHostError) return undefined; // points into a private network, nothing to check
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return { url: u.href, error: cause?.code ?? cause?.message ?? (e as Error).message };
  }
}

export async function tlsInfo(url: string, timeout: number, trusted?: string): Promise<ScanContext["tls"]> {
  const u = new URL(url);
  if (u.protocol !== "https:") return undefined;
  try {
    await assertPublicHost(u.hostname, trusted);
  } catch (e) {
    return { protocol: "", validTo: "", daysLeft: 0, authorized: false, error: (e as Error).message };
  }
  return new Promise((resolve) => {
    const socket = connect({ host: u.hostname, port: Number(u.port) || 443, servername: u.hostname, rejectUnauthorized: false });
    const done = (value: ScanContext["tls"]) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout, () => done({ protocol: "", validTo: "", daysLeft: 0, authorized: false, error: "timeout" }));
    socket.on("error", (e) => done({ protocol: "", validTo: "", daysLeft: 0, authorized: false, error: e.message }));
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const validTo = new Date(cert.valid_to);
      done({
        protocol: socket.getProtocol() ?? "",
        validTo: validTo.toISOString().slice(0, 10),
        daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000),
        authorized: socket.authorized,
        error: socket.authorized ? undefined : String(socket.authorizationError),
      });
    });
  });
}

export async function emailDns(url: string): Promise<ScanContext["dns"]> {
  const domain = siteOf(new URL(url).hostname);
  if (!domain.includes(".") || /^[\d.]+$/.test(domain)) return undefined;
  const txt = async (name: string) => (await resolveTxt(name).catch(() => [])).map((parts) => parts.join(""));
  const [root, dmarc, mx] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    resolveMx(domain).catch(() => []),
  ]);
  return {
    spf: root.find((r) => r.toLowerCase().startsWith("v=spf1")),
    dmarc: dmarc.find((r) => r.toLowerCase().startsWith("v=dmarc1")),
    mx: mx.length > 0,
  };
}

/** Looks up the country of each host's IP address with IPinfo. Only runs with a token. */
export async function countries(hosts: string[], token: string | undefined, timeout: number): Promise<Record<string, string>> {
  if (!token) return {};
  const result: Record<string, string> = {};
  await Promise.all(
    hosts.map(async (host) => {
      try {
        const { address } = await lookup(host);
        const res = await fetch(`https://api.ipinfo.io/lite/${address}?token=${encodeURIComponent(token)}`, {
          signal: AbortSignal.timeout(timeout),
        });
        const data = (await res.json()) as { country_code?: string };
        if (data.country_code) result[host] = data.country_code;
      } catch {
        // unknown country, the check falls back to data/third-parties.yml
      }
    }),
  );
  return result;
}
