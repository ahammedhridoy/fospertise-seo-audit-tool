const config = require('../config');

/**
 * Verify Cloudflare Turnstile token.
 * If TURNSTILE_SECRET is not configured, skips verification (for local development/testing).
 *
 * @param {string} token
 * @param {string} [remoteip]
 * @returns {Promise<boolean>}
 */
async function verifyTurnstile(token, remoteip) {
  if (!config.TURNSTILE_SECRET) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', config.TURNSTILE_SECRET);
    formData.append('response', token);
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    return Boolean(data.success);
  } catch (_) {
    return false;
  }
}

module.exports = {
  verifyTurnstile
};
