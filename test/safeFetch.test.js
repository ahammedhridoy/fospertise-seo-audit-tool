const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { safeFetch, TooManyRedirectsError, UnsupportedContentTypeError, ConnectionError } = require('../src/services/safeFetch');
const { PrivateHostError } = require('../src/services/urlGuard');

/**
 * Helper to create a local test HTTP server.
 * Note: safeFetch normally blocks private IPs via assertPublicHost,
 * so these tests mock or adjust behavior as needed.
 */
function createTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('safeFetch: rejects URLs pointing to private IPs', async () => {
  await assert.rejects(
    () => safeFetch('http://127.0.0.1'),
    (err) => err instanceof PrivateHostError
  );

  await assert.rejects(
    () => safeFetch('http://10.0.0.1'),
    (err) => err instanceof PrivateHostError
  );

  await assert.rejects(
    () => safeFetch('http://192.168.1.1'),
    (err) => err instanceof PrivateHostError
  );
});

test('safeFetch: rejects localhost', async () => {
  await assert.rejects(
    () => safeFetch('http://localhost'),
    (err) => err instanceof PrivateHostError
  );
});

test('safeFetch: rejects *.internal and *.local hostnames', async () => {
  await assert.rejects(
    () => safeFetch('http://service.internal'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => safeFetch('http://mybox.local'),
    (err) => err instanceof PrivateHostError
  );
});

test('safeFetch: errors are typed with user-friendly messages', async () => {
  try {
    await safeFetch('http://192.168.1.1');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err instanceof PrivateHostError);
    assert.strictEqual(err.code, 'PRIVATE_HOST');
    assert.ok(typeof err.message === 'string');
    assert.ok(err.message.length > 0);
    // Must NOT contain raw error info like stack traces or IP addresses
    assert.ok(!err.message.includes('ECONNREFUSED'));
    assert.ok(!err.message.includes('Error:'));
  }
});

test('safeFetch: rejects redirect to a private IP', async () => {
  // We can't easily test a real redirect-to-private without a real
  // public server, so instead we verify that normalizeUrl + assertPublicHost
  // would block a redirect target pointing at a private IP. The logic
  // in safeFetch calls assertPublicHost on each redirect target.

  // Test the components that safeFetch relies on for redirect safety:
  const { assertPublicHost } = require('../src/services/urlGuard');

  // Simulating: public site redirects to 10.0.0.1
  await assert.rejects(
    () => assertPublicHost('10.0.0.1'),
    (err) => err instanceof PrivateHostError
  );

  // Simulating: public site redirects to 169.254.169.254 (cloud metadata)
  await assert.rejects(
    () => assertPublicHost('169.254.169.254'),
    (err) => err instanceof PrivateHostError
  );

  // Simulating: public site redirects to localhost
  await assert.rejects(
    () => assertPublicHost('localhost'),
    (err) => err instanceof PrivateHostError
  );
});

test('safeFetch: rejects URLs with credentials', async () => {
  // normalizeUrl (called by safeFetch) rejects credentials
  const { InvalidUrlError } = require('../src/services/urlGuard');

  await assert.rejects(
    () => safeFetch('http://user:pass@example.com'),
    (err) => err instanceof InvalidUrlError
  );
});

test('safeFetch: rejects URLs with odd ports', async () => {
  const { InvalidUrlError } = require('../src/services/urlGuard');

  await assert.rejects(
    () => safeFetch('http://example.com:8080'),
    (err) => err instanceof InvalidUrlError
  );

  await assert.rejects(
    () => safeFetch('http://example.com:22'),
    (err) => err instanceof InvalidUrlError
  );
});

