// Network lookups without a browser: probe paths, plain HTTP, the www variant, TLS, DNS and IP countries.

import { readFileSync } from "node:fs";
import { connect } from "node:tls";
import { lookup, resolveMx, resolveTxt } from "node:dns/promises";
import { parse } from "yaml";
import { siteOf } from "./text.ts";
import type { Probe, ScanContext } from "./sdk.ts";

const PROBES = parse(readFileSync(new URL("../data/probes.yml", import.meta.url), "utf8")) as Array<{
  path: string;
  kind: "file" | "error";
  expect?: string;
}>;
const MAX_BODY = 50_000;

/** Fetches every path in data/probes.yml from the site's origin. */
export async function probe(origin: string, userAgent: string, timeout: number): Promise<Probe[]> {
  return Promise.all(
    PROBES.map(async ({ path, kind, expect }) => {
      try {
        const res = await fetch(new URL(path, origin), {
          redirect: "manual",
          headers: { "user-agent": userAgent },
          signal: AbortSignal.timeout(timeout),
        });
        const body = (await res.text()).slice(0, MAX_BODY);
        const headers = Object.fromEntries(res.headers);
        const exposed = kind === "file" && res.status === 200 && !!expect && new RegExp(expect, "m").test(body);
        return { path, kind, status: res.status, headers, body, exposed };
      } catch {
        return { path, kind, status: 0, headers: {}, body: "", exposed: false };
      }
    }),
  );
}

export async function plainHttp(url: string, timeout: number): Promise<ScanContext["http"]> {
  const u = new URL(url);
  if (u.protocol !== "https:") return undefined;
  u.protocol = "http:";
  try {
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(timeout) });
    return { status: res.status, location: res.headers.get("location") ?? "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Requests the host with "www." added or removed and follows redirects. */
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
    const res = await fetch(u, { signal: AbortSignal.timeout(timeout) });
    return { url: u.href, status: res.status, finalUrl: res.url };
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return { url: u.href, error: cause?.code ?? cause?.message ?? (e as Error).message };
  }
}

export function tlsInfo(url: string, timeout: number): Promise<ScanContext["tls"]> {
  const u = new URL(url);
  if (u.protocol !== "https:") return Promise.resolve(undefined);
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
