// Keeps requests on the public internet. The scanned site decides where links and redirects point;
// without this, it could make the runner call its own network (cloud metadata, local services).
// The host of the URL the user passed is always allowed, so local dev servers and test fixtures work.

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32],
] as const) PRIVATE.addSubnet(net, prefix, "ipv6");

export class BlockedHostError extends Error {}

const bare = (host: string) => host.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "").replace(/\.$/, "");
const isLocalName = (host: string) => host === "localhost" || host.endsWith(".localhost");

/** False for loopback, private, link-local, CGNAT, multicast and reserved addresses, also as IPv4-mapped IPv6. */
export function isPublicAddress(ip: string): boolean {
  const a = bare(ip);
  const family = isIP(a);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)?.[1];
  if (mapped) return isPublicAddress(mapped);
  return !PRIVATE.check(a, family === 4 ? "ipv4" : "ipv6");
}

/** For the browser, where DNS per request is too slow: true for `localhost` and private IP literals. */
export function blockedInBrowser(host: string, trusted?: string): boolean {
  const h = bare(host);
  if (!h || (trusted && h === bare(trusted))) return false;
  return isLocalName(h) || (isIP(h) > 0 && !isPublicAddress(h));
}

/** Throws BlockedHostError unless the host is `trusted` or every address it resolves to is public. */
export async function assertPublicHost(host: string, trusted?: string): Promise<void> {
  const h = bare(host);
  if (trusted && h === bare(trusted)) return;
  if (isLocalName(h)) throw new BlockedHostError(`${h} is a local address`);
  const addresses = isIP(h) ? [h] : (await lookup(h, { all: true })).map((a) => a.address);
  const inner = addresses.find((a) => !isPublicAddress(a));
  if (inner) throw new BlockedHostError(`${h} resolves to the non-public address ${inner}`);
}

/** True when assertPublicHost passes. DNS errors count as not allowed. */
export const isPublicHost = (host: string, trusted?: string) => assertPublicHost(host, trusted).then(() => true, () => false);

/**
 * fetch() that checks the host before every request and follows at most `redirects` redirects by hand,
 * checking each hop. Returns the last response and its URL.
 */
export async function fetchPublic(url: string | URL, init: RequestInit, trusted: string | undefined, redirects = 0): Promise<{ res: Response; url: string }> {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(current.hostname, trusted);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (hop >= redirects || res.status < 300 || res.status >= 400 || !location) return { res, url: current.href };
    await res.body?.cancel();
    current = new URL(location, current);
  }
}
