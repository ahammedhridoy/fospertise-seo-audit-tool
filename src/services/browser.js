const { chromium } = require('playwright');
const { assertPublicHost } = require('./urlGuard');

let browserInstance = null;
let operationsCount = 0;
let activeContexts = 0;
const MAX_OPS_BEFORE_RECYCLE = 50;

// Host validation cache with TTL and size cap to avoid memory leaks or DNS rebinding stale cache
const hostValidationCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 500;

function isHostAllowedCached(hostname) {
  const entry = hostValidationCache.get(hostname);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    hostValidationCache.delete(hostname);
    return undefined;
  }
  return entry.allowed;
}

function setHostCached(hostname, allowed) {
  if (hostValidationCache.size >= MAX_CACHE_ENTRIES) {
    // Delete oldest entry
    const firstKey = hostValidationCache.keys().next().value;
    if (firstKey) hostValidationCache.delete(firstKey);
  }
  hostValidationCache.set(hostname, { allowed, timestamp: Date.now() });
}

/**
 * Get or launch the shared Playwright Chromium instance.
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    operationsCount = 0;
  }
  return browserInstance;
}

/**
 * Close the shared Playwright Chromium instance if running.
 */
async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (_) {}
    browserInstance = null;
    operationsCount = 0;
  }
}

/**
 * Check if browser should be recycled to prevent Chromium memory leaks.
 */
async function maybeRecycleBrowser() {
  operationsCount++;
  if (operationsCount >= MAX_OPS_BEFORE_RECYCLE && activeContexts === 0) {
    await closeBrowser();
  }
}

/**
 * Create a new browser context with security and resource interception:
 * - Blocks images, fonts, and media
 * - Aborts any request whose hostname fails assertPublicHost (cached per host with TTL)
 */
async function createSafeContext(options = {}) {
  const browser = await getBrowser();
  activeContexts++;

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'AIReadinessBot/1.0',
    ...options
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();

    // Block images, fonts, and media
    if (['image', 'font', 'media'].includes(resourceType)) {
      return route.abort();
    }

    try {
      const url = new URL(request.url());
      const hostname = url.hostname;

      if (!hostname) {
        return route.abort();
      }

      let isAllowed = isHostAllowedCached(hostname);
      if (isAllowed === undefined) {
        try {
          await assertPublicHost(hostname);
          isAllowed = true;
        } catch {
          isAllowed = false;
        }
        setHostCached(hostname, isAllowed);
      }

      if (!isAllowed) {
        return route.abort();
      }

      return route.continue();
    } catch {
      return route.abort();
    }
  });

  return context;
}

/**
 * Helper to run an async operation with a safely managed page and context.
 * Guaranteed to close both page and context in finally blocks.
 */
async function withPage(fn, options = {}) {
  const context = await createSafeContext(options);
  try {
    const page = await context.newPage();
    try {
      return await fn(page, context);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
    activeContexts = Math.max(0, activeContexts - 1);
    await maybeRecycleBrowser().catch(() => {});
  }
}

module.exports = {
  getBrowser,
  closeBrowser,
  createSafeContext,
  withPage
};
