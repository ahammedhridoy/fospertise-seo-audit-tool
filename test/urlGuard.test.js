const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeUrl,
  assertPublicHost,
  isPrivateIp,
  InvalidUrlError,
  PrivateHostError
} = require('../src/services/urlGuard');

// ─── normalizeUrl ────────────────────────────────────────────────

test('normalizeUrl: adds https:// when scheme is missing', () => {
  assert.strictEqual(normalizeUrl('example.com'), 'https://example.com/');
  assert.strictEqual(normalizeUrl('example.com/path'), 'https://example.com/path');
});

test('normalizeUrl: preserves existing http and https schemes', () => {
  assert.strictEqual(normalizeUrl('http://example.com'), 'http://example.com/');
  assert.strictEqual(normalizeUrl('https://example.com/page'), 'https://example.com/page');
});

test('normalizeUrl: lowercases the host', () => {
  assert.strictEqual(normalizeUrl('https://EXAMPLE.COM/Path'), 'https://example.com/Path');
});

test('normalizeUrl: removes the hash', () => {
  assert.strictEqual(normalizeUrl('https://example.com/page#section'), 'https://example.com/page');
});

test('normalizeUrl: removes credentials from the URL', () => {
  assert.throws(
    () => normalizeUrl('https://user:pass@example.com'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('https://user@example.com'),
    (err) => err instanceof InvalidUrlError
  );
});

test('normalizeUrl: rejects non-http/https schemes', () => {
  assert.throws(
    () => normalizeUrl('ftp://example.com'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('javascript:alert(1)'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('file:///etc/passwd'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('data:text/html,<h1>hi</h1>'),
    (err) => err instanceof InvalidUrlError
  );
});

test('normalizeUrl: allows only ports 80 and 443', () => {
  // Port 80 is OK (gets removed as default)
  const url80 = normalizeUrl('http://example.com:80/page');
  assert.ok(!url80.includes(':80'));

  // Port 443 is OK (gets removed as default)
  const url443 = normalizeUrl('https://example.com:443/page');
  assert.ok(!url443.includes(':443'));

  // Other ports are rejected
  assert.throws(
    () => normalizeUrl('http://example.com:8080'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('https://example.com:3000'),
    (err) => err instanceof InvalidUrlError
  );
  assert.throws(
    () => normalizeUrl('http://example.com:22'),
    (err) => err instanceof InvalidUrlError
  );
});

test('normalizeUrl: rejects URLs longer than 2048 characters', () => {
  const longPath = '/a'.repeat(2048);
  assert.throws(
    () => normalizeUrl('https://example.com' + longPath),
    (err) => err instanceof InvalidUrlError
  );
});

test('normalizeUrl: trims whitespace', () => {
  assert.strictEqual(normalizeUrl('  https://example.com  '), 'https://example.com/');
});

test('normalizeUrl: rejects empty or non-string input', () => {
  assert.throws(() => normalizeUrl(''), (err) => err instanceof InvalidUrlError);
  assert.throws(() => normalizeUrl('   '), (err) => err instanceof InvalidUrlError);
  assert.throws(() => normalizeUrl(null), (err) => err instanceof InvalidUrlError);
  assert.throws(() => normalizeUrl(undefined), (err) => err instanceof InvalidUrlError);
  assert.throws(() => normalizeUrl(123), (err) => err instanceof InvalidUrlError);
});

test('normalizeUrl: preserves query string', () => {
  assert.strictEqual(
    normalizeUrl('https://example.com/search?q=hello&lang=en'),
    'https://example.com/search?q=hello&lang=en'
  );
});

// ─── isPrivateIp ─────────────────────────────────────────────────

test('isPrivateIp: rejects private IPv4 ranges', () => {
  // 127.0.0.0/8 loopback
  assert.strictEqual(isPrivateIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('127.255.255.255'), true);

  // 10.0.0.0/8
  assert.strictEqual(isPrivateIp('10.0.0.1'), true);
  assert.strictEqual(isPrivateIp('10.255.255.255'), true);

  // 172.16.0.0/12
  assert.strictEqual(isPrivateIp('172.16.0.1'), true);
  assert.strictEqual(isPrivateIp('172.31.255.255'), true);
  assert.strictEqual(isPrivateIp('172.32.0.1'), false); // just outside range

  // 192.168.0.0/16
  assert.strictEqual(isPrivateIp('192.168.0.1'), true);
  assert.strictEqual(isPrivateIp('192.168.255.255'), true);

  // 169.254.0.0/16 link-local / cloud metadata
  assert.strictEqual(isPrivateIp('169.254.169.254'), true);
  assert.strictEqual(isPrivateIp('169.254.0.1'), true);

  // 0.0.0.0/8
  assert.strictEqual(isPrivateIp('0.0.0.0'), true);
  assert.strictEqual(isPrivateIp('0.255.255.255'), true);
});

test('isPrivateIp: accepts public IPv4 addresses', () => {
  assert.strictEqual(isPrivateIp('8.8.8.8'), false);
  assert.strictEqual(isPrivateIp('1.1.1.1'), false);
  assert.strictEqual(isPrivateIp('93.184.216.34'), false);
  assert.strictEqual(isPrivateIp('203.0.113.1'), false);
});

test('isPrivateIp: rejects private IPv6 addresses', () => {
  // ::1 loopback
  assert.strictEqual(isPrivateIp('::1'), true);
  assert.strictEqual(isPrivateIp('0:0:0:0:0:0:0:1'), true);

  // :: unspecified
  assert.strictEqual(isPrivateIp('::'), true);

  // fe80::/10 link-local
  assert.strictEqual(isPrivateIp('fe80::1'), true);
  assert.strictEqual(isPrivateIp('febf::1'), true);

  // fc00::/7 unique local
  assert.strictEqual(isPrivateIp('fc00::1'), true);
  assert.strictEqual(isPrivateIp('fd12:3456:789a::1'), true);
});

test('isPrivateIp: accepts public IPv6 addresses', () => {
  assert.strictEqual(isPrivateIp('2607:f8b0:4005:805::200e'), false);
  assert.strictEqual(isPrivateIp('2001:4860:4860::8888'), false);
});

test('isPrivateIp: rejects IPv4-mapped IPv6 with private addresses', () => {
  assert.strictEqual(isPrivateIp('::ffff:127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('::ffff:10.0.0.1'), true);
  assert.strictEqual(isPrivateIp('::ffff:192.168.1.1'), true);
  assert.strictEqual(isPrivateIp('::ffff:169.254.169.254'), true);

  // Hex form of IPv4-mapped
  assert.strictEqual(isPrivateIp('::ffff:7f00:0001'), true);  // 127.0.0.1
  assert.strictEqual(isPrivateIp('::ffff:a00:1'), true);      // 10.0.0.1
});

test('isPrivateIp: accepts IPv4-mapped IPv6 with public addresses', () => {
  assert.strictEqual(isPrivateIp('::ffff:8.8.8.8'), false);
  assert.strictEqual(isPrivateIp('::ffff:808:808'), false); // 8.8.8.8
});

// ─── assertPublicHost ────────────────────────────────────────────

test('assertPublicHost: rejects localhost', async () => {
  await assert.rejects(
    () => assertPublicHost('localhost'),
    (err) => err instanceof PrivateHostError
  );
});

test('assertPublicHost: rejects *.local hostnames', async () => {
  await assert.rejects(
    () => assertPublicHost('mybox.local'),
    (err) => err instanceof PrivateHostError
  );
});

test('assertPublicHost: rejects *.internal hostnames', async () => {
  await assert.rejects(
    () => assertPublicHost('service.internal'),
    (err) => err instanceof PrivateHostError
  );
});

test('assertPublicHost: rejects raw private IP literals', async () => {
  await assert.rejects(
    () => assertPublicHost('127.0.0.1'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => assertPublicHost('10.0.0.5'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => assertPublicHost('192.168.1.1'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => assertPublicHost('169.254.169.254'),
    (err) => err instanceof PrivateHostError
  );
});

test('assertPublicHost: rejects raw private IPv6 literals', async () => {
  await assert.rejects(
    () => assertPublicHost('::1'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => assertPublicHost('[::1]'),
    (err) => err instanceof PrivateHostError
  );
  await assert.rejects(
    () => assertPublicHost('fe80::1'),
    (err) => err instanceof PrivateHostError
  );
});

