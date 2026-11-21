const config = require('../config');

/**
 * Verify Google reCAPTCHA v2 token with Google's siteverify API.
 * If RECAPTCHA_SECRET is not configured, skips verification (for local development/testing).
 *
 * @param {string} token
 * @param {string} [remoteip]
 * @param {string} [secretOverride] - For testing or custom override
 * @returns {Promise<boolean>}
 */
async function verifyRecaptcha(token, remoteip, secretOverride) {
  // In automated test runs, skip verification unless explicitly invoked with a secretOverride in unit tests
  if ((config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') && secretOverride === undefined) {
    return true;
  }

  const secret = secretOverride !== undefined ? secretOverride : config.RECAPTCHA_SECRET;

  if (!secret) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
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
  verifyRecaptcha
};
