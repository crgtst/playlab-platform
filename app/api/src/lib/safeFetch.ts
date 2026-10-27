import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';

/** The address is one the API must not call: loopback, private, link-local (cloud metadata) and other internal ranges. */
export class BlockedAddressError extends Error {
  constructor(public address: string) {
    super(`${address} is not an address the API may fetch from`);
  }
}

/** Reaching the address failed, or what answered was not a plain 200 response. */
export class FetchFailedError extends Error {}

/** The body was larger than allowed. */
export class TooLargeError extends Error {}

function ipv4Blocked([a, b]: number[]): boolean {
  return (
    a === 0 || // "this network", and 0.0.0.0
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including 169.254.169.254 (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** The 16 bytes of an IPv6 address, including forms with `::` and an embedded dotted IPv4 address. */
function ipv6Bytes(ip: string): number[] {
  let text = ip;
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number);
    text = text.replace(/\d+\.\d+\.\d+\.\d+$/, `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`);
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return groups.flatMap((g) => [(parseInt(g, 16) >> 8) & 0xff, parseInt(g, 16) & 0xff]);
}

/** True for any loopback, private, link-local or otherwise internal IPv4 or IPv6 address. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(ip)) return ipv4Blocked(ip.split('.').map(Number));
  if (!net.isIPv6(ip)) return true; // not an address at all: refuse rather than guess
  const bytes = ipv6Bytes(ip);
  const zeroUpTo = (n: number) => bytes.slice(0, n).every((byte) => byte === 0);
  if (zeroUpTo(15) && bytes[15] <= 1) return true; // :: and ::1
  // An IPv4 address inside an IPv6 one (::ffff:127.0.0.1, which is written ::ffff:7f00:1 once parsed) is judged as the IPv4 address.
  if (zeroUpTo(10) && bytes[10] === 0xff && bytes[11] === 0xff) return ipv4Blocked(bytes.slice(12));
  if (zeroUpTo(12)) return ipv4Blocked(bytes.slice(12)); // the old IPv4-compatible form
  return (bytes[0] & 0xfe) === 0xfc || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) || bytes[0] === 0xff; // unique-local, link-local, multicast
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  /** Hostnames (not addresses) that may resolve to an internal address, such as a fixtures container. */
  allowedHosts: string[];
  /** False skips every address check. Only the ssrf-avatar-url defect does that. */
  checkAddresses: boolean;
}

/**
 * Fetches a URL with a GET, for the avatar import. The address is checked when the connection is made, on the address
 * the name resolves to, so a name that points at an internal address is refused as well as an internal address typed in.
 * Redirects are not followed (a redirect could point anywhere), and the body may not exceed `maxBytes`.
 */
// `agent: false` opens a new connection every time. A pooled connection would skip the address check on a later request
// to a host it had once been allowed to reach.
export function safeFetch(url: URL, options: SafeFetchOptions): Promise<{ status: number; body: Buffer }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = options.allowedHosts.includes(host.toLowerCase()) && !net.isIP(host);

  return new Promise((resolve, reject) => {
    if (options.checkAddresses && !allowed && net.isIP(host) && isBlockedAddress(host)) {
      return reject(new BlockedAddressError(host));
    }
    // Checks every address the name resolves to, at the moment the connection is made. Node asks for all of them
    // (and tries each in turn) or for one, depending on the version and settings, so both answers are handled.
    const lookup: net.LookupFunction = (hostname, lookupOptions, callback) => {
      dns.lookup(hostname, lookupOptions, (err, addresses, family) => {
        if (err) return (callback as (e: Error) => void)(err);
        const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: family as number }];
        const refused = options.checkAddresses && !allowed ? list.find((entry) => isBlockedAddress(entry.address)) : undefined;
        if (refused) return (callback as (e: Error) => void)(new BlockedAddressError(refused.address));
        if (Array.isArray(addresses)) return (callback as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
        callback(null, addresses as string, family as number);
      });
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      { method: 'GET', lookup, agent: false, timeout: options.timeoutMs, headers: { Accept: 'image/png,image/jpeg' } },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200) {
          response.resume();
          return reject(new FetchFailedError(`The address answered ${status}`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy();
            return reject(new TooLargeError('The image is larger than the limit'));
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
        response.on('error', (err) => reject(new FetchFailedError(err.message)));
      },
    );
    request.on('timeout', () => request.destroy(new FetchFailedError('The address did not answer in time')));
    request.on('error', (err) =>
      reject(
        err instanceof BlockedAddressError || err instanceof TooLargeError
          ? err
          : (err as Error & { cause?: unknown }).cause instanceof BlockedAddressError
            ? (err as Error & { cause: BlockedAddressError }).cause
            : new FetchFailedError(err.message),
      ),
    );
    request.end();
  });
}
