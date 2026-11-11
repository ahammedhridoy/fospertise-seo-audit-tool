const cheerio = require('cheerio');
const pLimit = require('p-limit').default || require('p-limit');
const { safeFetch } = require('./safeFetch');
const { normalizeUrl } = require('./urlGuard');
const config = require('../config');

const CONCURRENCY = 3;
const PAGE_TIMEOUT_MS = 10_000;
const MAIN_TEXT_MAX = 6000;
const MAX_BLOG_POSTS = 3;

// File extensions to skip
const SKIP_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.tar', '.gz', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ogg', '.wav',
  '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map',
  '.xml', '.json', '.csv', '.txt', '.rss', '.atom'
]);

// Priority keywords in URL path (higher index = lower priority)
const PRIORITY_KEYWORDS = [
  { pattern: /^\/?$/, priority: 0, label: 'home' },
  { pattern: /\b(about|who-we-are|our-story)\b/i, priority: 1, label: 'about' },
  { pattern: /\b(service|solution|product|offering|what-we-do)\b/i, priority: 2, label: 'service' },
  { pattern: /\b(contact|get-in-touch|reach-us)\b/i, priority: 3, label: 'contact' },
  { pattern: /\b(pricing|price|plans?|cost)\b/i, priority: 4, label: 'pricing' },
  { pattern: /\b(portfolio|case|cases|work|projects?|clients?)\b/i, priority: 5, label: 'portfolio' },
  { pattern: /\b(faq|frequently-asked|questions)\b/i, priority: 6, label: 'faq' },
  { pattern: /\b(team|people|staff|our-team)\b/i, priority: 7, label: 'team' },
  { pattern: /\b(blog|news|articles?|insights?|resources?)\b/i, priority: 8, label: 'blog' },
  { pattern: /\b(privacy|privacy-policy)\b/i, priority: 9, label: 'privacy' },
  { pattern: /\b(terms|terms-of-service|terms-and-conditions|tos)\b/i, priority: 10, label: 'terms' }
];

/**
 * Normalize a hostname for same-site comparison: lowercase, strip leading www.
 */
function normHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Get the priority of a URL path. Lower number = higher priority.
 * Returns 100 for unrecognized paths.
 */
function getPathPriority(pathname) {
  for (const kw of PRIORITY_KEYWORDS) {
    if (kw.pattern.test(pathname)) {
      return kw.priority;
    }
  }
  return 100; // lowest priority for unknown paths
}

/**
 * Get the label (e.g. 'blog', 'about') of a URL path for blog-post limiting.
 */
function getPathLabel(pathname) {
  for (const kw of PRIORITY_KEYWORDS) {
    if (kw.pattern.test(pathname)) {
      return kw.label;
    }
  }
  return null;
}

/**
 * Check if a URL points to a file we should skip.
 */
function isFileUrl(pathname) {
  const lower = pathname.toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = lower.slice(dotIndex);
  return SKIP_EXTENSIONS.has(ext);
}

/**
 * Deduplicate URLs: strip query string and trailing slash for comparison.
 */
function dedupeKey(urlString) {
  try {
    const u = new URL(urlString);
    // Normalize: lowercase host, strip www, remove query, remove trailing slash
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return normHost(u.hostname) + path;
  } catch {
    return urlString;
  }
}

/**
 * Extract all phone-like strings from text.
 */
function extractPhones(text) {
  const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?\(?\d{1,5}\)?[\s.-]?\d{1,5}[\s.-]?\d{1,9}/g;
  const matches = text.match(phoneRegex) || [];
  // Filter to keep only plausible phone numbers (at least 7 digits)
  return [...new Set(
    matches
      .map((m) => m.trim())
      .filter((m) => m.replace(/\D/g, '').length >= 7)
  )];
}

/**
 * Extract email addresses from text.
 */
function extractEmails(text) {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

/**
 * Parse a fetched HTML page into a structured plain object.
 */
function parsePage(url, status, html) {
  const $ = cheerio.load(html);

  // Title
  const title = $('title').first().text().trim() || '';

  // Meta description
  const metaDescription = $('meta[name="description"]').attr('content') || '';

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href') || '';

  // Language
  const lang = $('html').attr('lang') || $('body').attr('lang') || '';

  // Robots meta
  const robotsMeta = $('meta[name="robots"]').attr('content') || '';

  // Headings
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  // Heading order check: no jumps (e.g. h1 → h4 without h2/h3)
  const headingOrder = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName.charAt(1), 10);
    headingOrder.push(level);
  });
  let headingOrderOk = true;
  for (let i = 1; i < headingOrder.length; i++) {
    if (headingOrder[i] > headingOrder[i - 1] + 1) {
      headingOrderOk = false;
      break;
    }
  }

  // Viewport
  const hasViewport = $('meta[name="viewport"]').length > 0;

  // OG tags
  const ogTags = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) {
      ogTags[prop] = content;
    }
  });

  // JSON-LD
  const jsonLd = [];
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (raw) {
        const parsed = JSON.parse(raw);
        jsonLd.push(parsed);
      }
    } catch {
      jsonLdErrors++;
    }
  });

  // Links
  const pageHost = normHost(new URL(url).hostname);
  const internalLinks = [];
  const externalLinks = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, url);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
      const linkHost = normHost(resolved.hostname);
      const linkUrl = resolved.origin + resolved.pathname;
      if (linkHost === pageHost) {
        if (!internalLinks.includes(linkUrl)) {
          internalLinks.push(linkUrl);
        }
      } else {
        if (!externalLinks.includes(linkUrl)) {
          externalLinks.push(linkUrl);
        }
      }
    } catch {
      // Skip malformed hrefs
    }
  });

  // Counts
  const listCount = $('ul, ol').length;
  const tableCount = $('table').length;
  const imageCount = $('img').length;
  const imagesWithAlt = $('img[alt]').filter(
    (_, el) => ($(el).attr('alt') || '').trim() !== ''
  ).length;

  // Form
  const hasForm = $('form').length > 0;

  // Main text: remove non-content elements
  const $clone = cheerio.load(html);
  $clone('script, style, noscript, nav, footer, header').remove();
  $clone('[class*="cookie"], [id*="cookie"]').remove();
  $clone('[class*="Cookie"], [id*="Cookie"]').remove();
  $clone('[class*="consent"], [id*="consent"]').remove();
  $clone('[class*="banner"], [id*="banner"]').remove();

  let mainText = $clone('body').text().replace(/\s+/g, ' ').trim();
  if (mainText.length > MAIN_TEXT_MAX) {
    mainText = mainText.slice(0, MAIN_TEXT_MAX);
  }

  // Word count
  const words = mainText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // First 200 words
  const first200Words = words.slice(0, 200).join(' ');

  // Phones and emails from full body text
  const bodyText = $('body').text();
  const phones = extractPhones(bodyText);
  const emails = extractEmails(bodyText);

  return {
    url,
    status,
    title,
    metaDescription,
    canonical,
    lang,
    robotsMeta,
    h1,
    h2,
    h3,
    headingOrderOk,
    wordCount,
    mainText,
    first200Words,
    listCount,
    tableCount,
    imageCount,
    imagesWithAlt,
    jsonLd,
    jsonLdErrors,
    internalLinks,
    externalLinks,
    hasViewport,
    ogTags,
    phones,
    emails,
    hasForm
  };
}

/**
 * Crawl a site starting from startUrl.
 *
 * @param {string} startUrl - The homepage URL
 * @param {object} options
 * @param {number} options.maxPages - Max pages to crawl (default: config.MAX_PAGES)
 * @param {string[]} options.extraUrls - Additional URLs (e.g. from sitemap) added at lower priority
 * @returns {{ pages: object[], errors: { url: string, error: string }[] }}
 */
async function crawlSite(startUrl, options = {}) {
  const maxPages = options.maxPages || config.MAX_PAGES;
  const extraUrls = options.extraUrls || [];

  const limit = pLimit(CONCURRENCY);
  const pages = [];
  const errors = [];
  const seen = new Set(); // deduplication keys
  let blogCount = 0;

  // Parse the start URL to determine the site host
  let startParsed;
  try {
    startParsed = new URL(normalizeUrl(startUrl));
  } catch {
    errors.push({ url: startUrl, error: 'Invalid start URL' });
    return { pages, errors };
  }

  const siteHost = normHost(startParsed.hostname);
  const normalizedStart = startParsed.toString();

  /**
   * Fetch and parse a single page. Returns the parsed page or null on failure.
   */
  async function fetchPage(url) {
    try {
      const result = await safeFetch(url, { timeout: PAGE_TIMEOUT_MS });
      return parsePage(result.finalUrl, result.status, result.body);
    } catch (err) {
      errors.push({ url, error: err.message || 'Failed to fetch' });
      return null;
    }
  }

  // 1. Fetch the homepage first (synchronously, before parallel work)
  const homeKey = dedupeKey(normalizedStart);
  seen.add(homeKey);

  const homePage = await fetchPage(normalizedStart);
  if (!homePage) {
    // Homepage couldn't be loaded — still return what we have
    return { pages, errors };
  }
  pages.push(homePage);

  // 2. Collect candidate URLs from homepage internal links
  const candidates = []; // { url, priority }

  for (const link of homePage.internalLinks) {
    addCandidate(link, false);
  }

  // 3. Add extra URLs (sitemap) at lower priority
  for (const extra of extraUrls) {
    addCandidate(extra, true);
  }

  function addCandidate(rawUrl, isExtra) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }

    // Must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

    // Must be same site
    if (normHost(parsed.hostname) !== siteHost) return;

    // Skip file URLs
    if (isFileUrl(parsed.pathname)) return;

    // Deduplicate
    const key = dedupeKey(rawUrl);
    if (seen.has(key)) return;
    seen.add(key);

    const priority = isExtra
      ? getPathPriority(parsed.pathname) + 50 // sitemap URLs get lower priority
      : getPathPriority(parsed.pathname);

    candidates.push({ url: parsed.origin + parsed.pathname, priority, pathname: parsed.pathname });
  }

  // 4. Sort by priority (lower number first)
  candidates.sort((a, b) => a.priority - b.priority);

  // 5. Filter: limit blog posts to MAX_BLOG_POSTS
  const filtered = [];
  for (const c of candidates) {
    if (filtered.length + 1 >= maxPages) break; // +1 for homepage

    const label = getPathLabel(c.pathname);
    if (label === 'blog') {
      // Only count sub-pages under /blog/ as posts, not /blog itself
      const isBlogIndex = /^\/?blog\/?$/i.test(c.pathname);
      if (!isBlogIndex) {
        blogCount++;
        if (blogCount > MAX_BLOG_POSTS) continue;
      }
    }

    filtered.push(c);
  }

  // 6. Fetch pages in parallel with concurrency limit
  const remaining = maxPages - pages.length; // how many more we can fetch
  const toFetch = filtered.slice(0, remaining);

  const results = await Promise.all(
    toFetch.map((c) => limit(() => fetchPage(c.url)))
  );

  for (const page of results) {
    if (page) {
      pages.push(page);

      // Discover more internal links from this page
      for (const link of page.internalLinks) {
        if (pages.length + filtered.length >= maxPages * 2) break; // don't endlessly add
        addCandidate(link, false);
      }
    }
  }

  return { pages, errors };
}

module.exports = { crawlSite, parsePage };
