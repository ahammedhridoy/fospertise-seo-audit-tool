const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');

test('GET /api/health returns { ok: true }', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/health`;

  const res = await fetch(url);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.deepStrictEqual(data, { ok: true });
});

test('GET /unknown-route returns 404 with structured error', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/non-existent-route`;

  const res = await fetch(url);
  assert.strictEqual(res.status, 404);

  const data = await res.json();
  assert.strictEqual(data.code, 'NOT_FOUND');
  assert.strictEqual(data.error, 'Not found');
});

