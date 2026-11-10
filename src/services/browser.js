const { chromium } = require('playwright');
const { assertPublicHost } = require('./urlGuard');

let browserInstance = null;
const hostValidationCache = new Map();

/**
 * Get or launch the shared Playwright Chromium instance.
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
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
  }
}

/**
 * Create a new browser context with security and resource interception:
 * - Blocks images, fonts, and media
 * - Aborts any request whose hostname fails assertPublicHost (cached per host)
 */
async function createSafeContext(options = {}) {
  const browser = await getBrowser();
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

      let isAllowed = hostValidationCache.get(hostname);
      if (isAllowed === undefined) {
        try {
          await assertPublicHost(hostname);
          isAllowed = true;
        } catch {
          isAllowed = false;
        }
        hostValidationCache.set(hostname, isAllowed);
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
  }
}

module.exports = {
  getBrowser,
  closeBrowser,
  createSafeContext,
  withPage
};
