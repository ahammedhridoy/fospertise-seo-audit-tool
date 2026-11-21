const test = require('node:test');
const assert = require('node:assert');
const { verifyRecaptcha } = require('../src/services/recaptcha');

test('verifyRecaptcha: returns true when RECAPTCHA_SECRET is empty (dev mode)', async () => {
  const result = await verifyRecaptcha('', '1.2.3.4', '');
  assert.strictEqual(result, true);
});

test('verifyRecaptcha: returns false when RECAPTCHA_SECRET is set but token is empty', async () => {
  const result = await verifyRecaptcha('', '1.2.3.4', '6Le-test-secret');
  assert.strictEqual(result, false);
});

test('verifyRecaptcha: returns true when Google siteverify responds success: true', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, opts) => {
      assert(url.includes('google.com/recaptcha/api/siteverify'));
      assert.strictEqual(opts.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          success: true,
          challenge_ts: '2026-11-14T00:00:00Z',
          hostname: 'fospertise.com'
        })
      };
    };

    const ok = await verifyRecaptcha('valid-test-token', '1.2.3.4', '6Le-test-secret');
    assert.strictEqual(ok, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('verifyRecaptcha: returns false when Google siteverify responds success: false', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response']
      })
    });

    const ok = await verifyRecaptcha('invalid-token', '1.2.3.4', '6Le-test-secret');
    assert.strictEqual(ok, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('verifyRecaptcha: returns false on network failure', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => {
      throw new Error('Connection timed out');
    };

    const ok = await verifyRecaptcha('some-token', '1.2.3.4', '6Le-test-secret');
    assert.strictEqual(ok, false);
  } finally {
    global.fetch = originalFetch;
  }
});
