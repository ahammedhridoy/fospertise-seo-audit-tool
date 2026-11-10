const dns = require('dns').promises;
const net = require('net');

// Custom error types for typed, user-friendly error messages
class UrlGuardError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'UrlGuardError';
    this.code = code;
  }
}

class InvalidUrlError extends UrlGuardError {
  constructor(message = 'Please enter a valid website address.') {
    super(message, 'INVALID_URL');
    this.name = 'InvalidUrlError';
    this.status = 400;
  }
}

class PrivateHostError extends UrlGuardError {
  constructor(message = 'This address cannot be checked.') {
    super(message, 'PRIVATE_HOST');
    this.name = 'PrivateHostError';
    this.status = 400;
  }
}

/**
 * Normalize a user-supplied URL into a safe, canonical form.
 * Throws InvalidUrlError on anything suspect.
 */
function normalizeUrl(input) {
  if (typeof input !== 'string') {
    throw new InvalidUrlError();
  }

  let raw = input.trim();
  if (!raw) {
    throw new InvalidUrlError();
  }

  // Add https:// if there is no scheme
  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidUrlError();
  }

  // Allow only http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidUrlError();
  }

  // Reject credentials in the URL
  if (parsed.username || parsed.password) {
    throw new InvalidUrlError();
  }

  // Must have a hostname
  if (!parsed.hostname) {
    throw new InvalidUrlError();
  }

  // Allow only ports 80 and 443 (or the default, which is empty)
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new InvalidUrlError();
  }

  // Lowercase the host
  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove the hash
  parsed.hash = '';

  // Remove the default port from the string to keep it clean
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  const result = parsed.toString();

  // Max length 2048
  if (result.length > 2048) {
    throw new InvalidUrlError();
  }

  return result;
}

/**
 * Check if an IP address falls into a private, loopback, link-local,
 * or metadata range. Returns true if the IP should be rejected.
 */
function isPrivateIp(rawIp) {
  let ip = rawIp.trim();

  // Strip brackets from IPv6 (e.g. [::1])
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  // Handle IPv4-mapped IPv6 with dotted notation (e.g. ::ffff:127.0.0.1)
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const rest = ip.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateIp(rest);
    }
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // malformed → reject
    }
    const [b0, b1] = parts;

    if (b0 === 0) return true;           // 0.0.0.0/8
    if (b0 === 10) return true;          // 10.0.0.0/8
    if (b0 === 127) return true;         // 127.0.0.0/8
    if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12
    if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16

    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    // Quick checks for common forms
    if (lower === '::1' || lower === '::') return true;

    // Expand the IPv6 address into 8 words
    let fullBlocks;
    if (lower.includes('::')) {
      const halves = lower.split('::');
      const left = halves[0] ? halves[0].split(':') : [];
      const right = halves[1] ? halves[1].split(':') : [];
      const needed = 8 - left.length - right.length;
      const middle = Array(Math.max(0, needed)).fill('0');
      fullBlocks = [...left, ...middle, ...right];
    } else {
      fullBlocks = lower.split(':');
    }

    const words = fullBlocks.map((b) => parseInt(b || '0', 16));
    if (words.length !== 8 || words.some((w) => isNaN(w))) {
      return true; // malformed → reject
    }

    // ::1 loopback
    if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return true;
    // :: unspecified
    if (words.every((w) => w === 0)) return true;

    // IPv4-mapped IPv6: ::ffff:xxxx:xxxx (words 0-4 are 0, word 5 is 0xffff)
    if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
      const mappedIp = [
        (words[6] >> 8) & 0xff,
        words[6] & 0xff,
        (words[7] >> 8) & 0xff,
        words[7] & 0xff
      ].join('.');
      return isPrivateIp(mappedIp);
    }

    // fc00::/7 – unique local (first byte is 0xfc or 0xfd)
    const firstByte = (words[0] >> 8) & 0xff;
    if ((firstByte & 0xfe) === 0xfc) return true;

    // fe80::/10 – link-local (first 10 bits: 1111 1110 10xx)
    if ((words[0] & 0xffc0) === 0xfe80) return true;

    return false;
  }

  // Not a valid IPv4 or IPv6 → reject
  return true;
}

/**
 * Resolve a hostname and assert that every returned address is public.
 * Rejects localhost, *.local, *.internal by name before DNS resolution.
 * Returns the list of resolved addresses (useful for IP-pinning in safeFetch).
 */
async function assertPublicHost(hostname) {
  const lower = hostname.toLowerCase();

  // Reject known-private hostnames by name
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    throw new PrivateHostError();
  }

  // If the hostname is a raw IP literal, check it directly
  if (net.isIPv4(lower)) {
    if (isPrivateIp(lower)) {
      throw new PrivateHostError();
    }
    return [lower];
  }
  // IPv6 literal (may have brackets from URL parsing)
  const bareIpv6 = lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower;
  if (net.isIPv6(bareIpv6)) {
    if (isPrivateIp(bareIpv6)) {
      throw new PrivateHostError();
    }
    return [bareIpv6];
  }

  // Resolve DNS – both A and AAAA
  const [v4Result, v6Result] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname)
  ]);

  const addresses = [];
  if (v4Result.status === 'fulfilled') addresses.push(...v4Result.value);
  if (v6Result.status === 'fulfilled') addresses.push(...v6Result.value);

  if (addresses.length === 0) {
    throw new InvalidUrlError('We could not open this website. Please check the address.');
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new PrivateHostError();
    }
  }

  return addresses;
}

module.exports = {
  normalizeUrl,
  assertPublicHost,
  isPrivateIp,
  InvalidUrlError,
  PrivateHostError,
  UrlGuardError
};
