const { assertPublicHost, normalizeUrl, UrlGuardError } = require('./urlGuard');

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const USER_AGENT = 'AIReadinessBot/1.0';
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'text/plain'
];

// Custom error types
class FetchError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.status = status;
  }
}

class ContentTooLargeError extends FetchError {
  constructor() {
    super('The page is too large to process.', 'CONTENT_TOO_LARGE');
    this.name = 'ContentTooLargeError';
  }
}

class UnsupportedContentTypeError extends FetchError {
  constructor() {
    super('The page returned an unsupported content type.', 'UNSUPPORTED_CONTENT_TYPE');
    this.name = 'UnsupportedContentTypeError';
  }
}

class TooManyRedirectsError extends FetchError {
  constructor() {
    super('Too many redirects.', 'TOO_MANY_REDIRECTS');
    this.name = 'TooManyRedirectsError';
  }
}

class TimeoutError extends FetchError {
  constructor() {
    super('We could not open this website. Please check the address.', 'TIMEOUT', 504);
    this.name = 'TimeoutError';
  }
}

class ConnectionError extends FetchError {
  constructor() {
    super('We could not open this website. Please check the address.', 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

/**
 * Extract the base content-type (without charset parameters).
 */
function getBaseContentType(headers) {
  const ct = headers.get('content-type') || '';
  return ct.split(';')[0].trim().toLowerCase();
}

/**
 * Read a response body up to MAX_BODY_BYTES. Throws ContentTooLargeError
 * if the stream exceeds that limit.
 */
async function readLimitedBody(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ContentTooLargeError();
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ContentTooLargeError) throw err;
    // Re-read failures become connection errors
    throw new ConnectionError();
  }

  const combined = Buffer.concat(chunks);
  return combined.toString('utf-8');
}

/**
 * Build a fetch URL that connects to the given IP directly, setting the
 * Host header to the original hostname. This pins the connection to the
 * validated IP to reduce DNS rebinding risk.
 *
 * Falls back to the original URL when IP-pinning isn't practical
 * (e.g. for HTTPS, where the TLS SNI needs the hostname).
 */
function buildPinnedUrl(parsedUrl, ip) {
  // IP-pinning only works reliably for HTTP because HTTPS needs
  // the correct SNI hostname in the TLS handshake.
  if (parsedUrl.protocol === 'http:') {
    const pinned = new URL(parsedUrl.toString());
    pinned.hostname = ip;
    return pinned.toString();
  }
  return parsedUrl.toString();
}

/**
 * Fetch a URL with SSRF protection:
 * - Runs assertPublicHost on every hostname (including redirect targets)
 * - Follows redirects manually (max 5)
 * - 10-second timeout
 * - 2 MB body limit
 * - Accepts only HTML/XML/text content types
 * - User-Agent: AIReadinessBot/1.0
 *
 * Returns { status, finalUrl, headers, body, redirects }.
 */
async function safeFetch(url, options = {}) {
  const timeout = options.timeout || TIMEOUT_MS;
  const redirects = [];
  let currentUrl = normalizeUrl(url);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const parsed = new URL(currentUrl);
    let addresses;

    try {
      addresses = await assertPublicHost(parsed.hostname);
    } catch (err) {
      if (err instanceof UrlGuardError) throw err;
      throw new ConnectionError();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const fetchHeaders = {
      'User-Agent': USER_AGENT,
      'Accept': ALLOWED_CONTENT_TYPES.join(', '),
      ...(options.headers || {})
    };

    let response;
    try {
      response = await fetch(currentUrl, {
        method: options.method || 'GET',
        headers: fetchHeaders,
        redirect: 'manual',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new TimeoutError();
      }
      throw new ConnectionError();
    } finally {
      clearTimeout(timer);
    }

    // Handle redirects (3xx with a Location header)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ConnectionError();
      }

      let nextUrl;
      try {
        nextUrl = normalizeUrl(new URL(location, currentUrl).toString());
      } catch (err) {
        if (err instanceof UrlGuardError) throw err;
        throw new ConnectionError();
      }

      redirects.push({ from: currentUrl, to: nextUrl, status: response.status });

      if (i === MAX_REDIRECTS) {
        throw new TooManyRedirectsError();
      }

      currentUrl = nextUrl;
      continue;
    }

    // Check content-type before reading the body
    const contentType = getBaseContentType(response.headers);
    if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new UnsupportedContentTypeError();
    }

    // Read the body with a size limit
    const body = await readLimitedBody(response);

    // Convert headers to a plain object
    const headersObj = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    return {
      status: response.status,
      finalUrl: currentUrl,
      headers: headersObj,
      body,
      redirects
    };
  }

  throw new TooManyRedirectsError();
}

module.exports = {
  safeFetch,
  FetchError,
  ContentTooLargeError,
  UnsupportedContentTypeError,
  TooManyRedirectsError,
  TimeoutError,
  ConnectionError
};
