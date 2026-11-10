const config = require('../config');

// In-memory cache for 24 hours: Map<url, { data, expiresAt }>
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 60_000;

const METRIC_KEYS = {
  lcp: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
  fcp: 'first-contentful-paint',
  speedIndex: 'speed-index'
};

/**
 * Perform a single HTTP request to PageSpeed Insights v5 with a timeout.
 */
async function fetchPageSpeedApi(apiUrl, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Google PageSpeed Insights API v5 runPagespeed endpoint with strategy=mobile.
 *
 * @param {string} url - Target URL to analyze
 * @returns {Promise<{
 *   performance?: number,
 *   seo?: number,
 *   accessibility?: number,
 *   bestPractices?: number,
 *   metrics?: { lcp: string|null, cls: string|null, tbt: string|null, fcp: string|null, speedIndex: string|null },
 *   opportunities?: Array<{ title: string, savings: string }>,
 *   error?: string
 * }>}
 */
async function getPageSpeed(url) {
  if (!url || typeof url !== 'string') {
    return { error: 'Invalid URL provided for PageSpeed test.' };
  }

  const normalizedUrl = url.trim();

  // 1. Check in-memory cache
  const cached = cache.get(normalizedUrl);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // 2. Prepare API query URL
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', normalizedUrl);
  endpoint.searchParams.set('key', config.PAGESPEED_API_KEY);
  endpoint.searchParams.set('strategy', 'mobile');
  endpoint.searchParams.append('category', 'performance');
  endpoint.searchParams.append('category', 'seo');
  endpoint.searchParams.append('category', 'accessibility');
  endpoint.searchParams.append('category', 'best-practices');

  const apiUrl = endpoint.toString();

  // 3. Request with timeout and retry once after 3 seconds on 429 or 5xx
  let response;
  let attempt = 0;

  while (attempt < 2) {
    attempt++;
    try {
      response = await fetchPageSpeedApi(apiUrl, TIMEOUT_MS);

      if (response.status === 429 || response.status >= 500) {
        if (attempt === 1) {
          // Wait 3 seconds before retry
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
      }

      break;
    } catch (err) {
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      return { error: 'PageSpeed Insights request timed out or network failed.' };
    }
  }

  if (!response || !response.ok) {
    let errorDetail = 'PageSpeed request failed';
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || errorDetail;
    } catch (_) {}
    return { error: errorDetail };
  }

  // 4. Parse Lighthouse response
  try {
    const data = await response.json();
    const lh = data.lighthouseResult;

    if (!lh || !lh.categories) {
      return { error: 'Incomplete PageSpeed report returned.' };
    }

    const categories = lh.categories || {};
    const performance = Math.round((categories.performance?.score ?? 0) * 100);
    const seo = Math.round((categories.seo?.score ?? 0) * 100);
    const accessibility = Math.round((categories.accessibility?.score ?? 0) * 100);
    const bestPractices = Math.round((categories['best-practices']?.score ?? 0) * 100);

    const audits = lh.audits || {};
    const metrics = {
      lcp: audits[METRIC_KEYS.lcp]?.displayValue || null,
      cls: audits[METRIC_KEYS.cls]?.displayValue || null,
      tbt: audits[METRIC_KEYS.tbt]?.displayValue || null,
      fcp: audits[METRIC_KEYS.fcp]?.displayValue || null,
      speedIndex: audits[METRIC_KEYS.speedIndex]?.displayValue || null
    };

    // Extract top 3 opportunities sorted by estimated savings
    const opportunities = Object.values(audits)
      .filter((a) => a.details && a.details.type === 'opportunity' && ((a.details.overallSavingsMs && a.details.overallSavingsMs > 0) || (a.details.overallSavingsBytes && a.details.overallSavingsBytes > 0)))
      .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0))
      .slice(0, 3)
      .map((a) => ({
        title: a.title,
        savings: a.displayValue || (a.details.overallSavingsMs ? `${a.details.overallSavingsMs} ms` : 'Savings available')
      }));

    const result = {
      performance,
      seo,
      accessibility,
      bestPractices,
      metrics,
      opportunities
    };

    // 5. Store in cache for 24 hours
    cache.set(normalizedUrl, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return result;
  } catch (err) {
    return { error: 'Failed to process PageSpeed response.' };
  }
}

/**
 * Clear the in-memory cache (useful for testing).
 */
function clearCache() {
  cache.clear();
}

module.exports = {
  getPageSpeed,
  clearCache
};
