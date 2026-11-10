const cheerio = require('cheerio');
const { safeFetch } = require('../safeFetch');
const { withPage } = require('../browser');

const BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Googlebot',
  'Bingbot'
];

/**
 * Parse a robots.txt string and decide allowed/blocked for '/' for each target bot.
 * Follows robots.txt rules:
 * - Specific group used first, then '*'
 * - Longest matching rule wins
 * - Allow beats Disallow on equal length
 */
function parseRobotsTxt(content) {
  const defaultBots = {};
  for (const b of BOTS) defaultBots[b] = 'allowed';

  if (!content || typeof content !== 'string') {
    return { exists: false, bots: defaultBots, sitemapsDeclared: [] };
  }

  const lines = content.split(/\r?\n/);
  const groups = [];
  let currentGroup = null;
  const sitemapsDeclared = [];

  for (let rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'sitemap') {
      if (value && !sitemapsDeclared.includes(value)) {
        sitemapsDeclared.push(value);
      }
      continue;
    }

    if (key === 'user-agent') {
      if (!currentGroup || currentGroup.rules.length > 0) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }
      currentGroup.agents.push(value.toLowerCase());
    } else if (key === 'disallow' || key === 'allow') {
      if (currentGroup) {
        currentGroup.rules.push({
          type: key, // 'allow' or 'disallow'
          path: value
        });
      }
    }
  }

  function matchesPath(rulePath, testPath) {
    if (!rulePath) return false;
    let cleanRule = rulePath.endsWith('$') ? rulePath.slice(0, -1) : rulePath;
    cleanRule = cleanRule.replace(/\*+$/, '');
    if (cleanRule === '' || cleanRule === '/') return true;
    return testPath.startsWith(cleanRule);
  }

  const resultBots = {};
  for (const bot of BOTS) {
    const botLower = bot.toLowerCase();
    let matchingGroup = groups.find((g) => g.agents.includes(botLower));
    if (!matchingGroup) {
      matchingGroup = groups.find((g) => g.agents.includes('*'));
    }

    if (!matchingGroup || matchingGroup.rules.length === 0) {
      resultBots[bot] = 'allowed';
      continue;
    }

    const matchingRules = matchingGroup.rules.filter((r) => matchesPath(r.path, '/'));
    if (matchingRules.length === 0) {
      resultBots[bot] = 'allowed';
      continue;
    }

    matchingRules.sort((a, b) => {
      const lenDiff = b.path.length - a.path.length;
      if (lenDiff !== 0) return lenDiff;
      if (a.type === 'allow' && b.type === 'disallow') return -1;
      if (a.type === 'disallow' && b.type === 'allow') return 1;
      return 0;
    });

    const winningRule = matchingRules[0];
    resultBots[bot] = winningRule.type === 'disallow' ? 'blocked' : 'allowed';
  }

  return { exists: true, bots: resultBots, sitemapsDeclared };
}

/**
 * 1. Check robots.txt
 */
async function checkRobotsTxt(origin) {
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await safeFetch(robotsUrl);
    if (res.status === 200 && res.body) {
      return parseRobotsTxt(res.body);
    }
  } catch (_) {}

  return parseRobotsTxt(null);
}

/**
 * Helper to extract <loc> URLs from XML
 */
function extractLocUrls(xml) {
  const urls = [];
  const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

/**
 * 2. Check Sitemap
 */
async function checkSitemap(origin, declaredSitemaps = []) {
  const candidates = [
    ...declaredSitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`
  ];

  const seen = new Set();
  const dedupedCandidates = candidates.filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  for (const candidate of dedupedCandidates) {
    try {
      const res = await safeFetch(candidate);
      if (res.status !== 200 || !res.body) continue;

      const body = res.body;
      const isSitemapIndex = /<sitemapindex/i.test(body);
      const isUrlSet = /<urlset/i.test(body);

      if (!isSitemapIndex && !isUrlSet) continue;

      if (isUrlSet) {
        const urls = extractLocUrls(body);
        return {
          exists: true,
          urlCount: urls.length,
          url: candidate,
          urls: urls.slice(0, 50)
        };
      }

      if (isSitemapIndex) {
        const childSitemaps = extractLocUrls(body).slice(0, 3);
        const aggregatedUrls = [];

        for (const childUrl of childSitemaps) {
          try {
            const childRes = await safeFetch(childUrl);
            if (childRes.status === 200 && childRes.body) {
              const childUrls = extractLocUrls(childRes.body);
              aggregatedUrls.push(...childUrls);
            }
          } catch (_) {}
        }

        return {
          exists: true,
          urlCount: aggregatedUrls.length,
          url: candidate,
          urls: aggregatedUrls.slice(0, 50)
        };
      }
    } catch (_) {}
  }

  return {
    exists: false,
    urlCount: 0,
    url: null,
    urls: []
  };
}

/**
 * 3. Check HTTPS
 */
async function checkHttps(startUrl, pages = []) {
  const homepage = pages.length > 0 ? pages[0] : null;
  const homepageStatus = homepage ? homepage.status : 200;

  try {
    const parsed = new URL(startUrl);
    const domain = parsed.hostname;
    const httpUrl = `http://${domain}/`;

    const res = await safeFetch(httpUrl);
    const finalIsHttps = res.finalUrl.startsWith('https://');
    const redirectedToHttps = res.redirects.some((r) => r.to.startsWith('https://'));

    return {
      isHttps: finalIsHttps,
      httpRedirectsToHttps: redirectedToHttps,
      homepageStatus,
      redirectChainLength: res.redirects.length
    };
  } catch (_) {
    // If HTTP fails to connect, fallback to startUrl inspection
    const isHttps = startUrl.startsWith('https://');
    return {
      isHttps,
      httpRedirectsToHttps: isHttps,
      homepageStatus,
      redirectChainLength: isHttps ? 0 : 0
    };
  }
}

/**
 * 4. Check JavaScript gap with Playwright
 */
async function checkJsGap(startUrl, pages = []) {
  const rawLength = (pages.length > 0 && pages[0].mainText) ? pages[0].mainText.length : 0;

  try {
    const renderedLength = await withPage(async (page) => {
      // 20-second timeout waiting for networkidle, fallback to domcontentloaded
      try {
        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 20000 });
      } catch (_) {
        try {
          await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        } catch (_) {}
      }

      return await page.evaluate(() => {
        const toRemove = document.querySelectorAll(
          'script, style, noscript, nav, footer, header, [class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="banner" i], [id*="banner" i]'
        );
        toRemove.forEach((el) => el.remove());

        const text = (document.body ? document.body.innerText || document.body.textContent || '' : '')
          .replace(/\s+/g, ' ')
          .trim();

        return text.length;
      });
    });

    let ratio = 1;
    if (renderedLength >= 200) {
      ratio = Number(Math.min(1, rawLength / renderedLength).toFixed(2));
    } else {
      ratio = 1;
    }

    return {
      rawLength,
      renderedLength,
      ratio
    };
  } catch (_) {
    return {
      rawLength,
      renderedLength: rawLength,
      ratio: 1
    };
  }
}

/**
 * Run all technical checks and return plain data (no scores).
 */
async function runTechnicalChecks(startUrl, pages = []) {
  const origin = new URL(startUrl).origin;

  const robots = await checkRobotsTxt(origin);
  const sitemap = await checkSitemap(origin, robots.sitemapsDeclared);
  const https = await checkHttps(startUrl, pages);
  const jsGap = await checkJsGap(startUrl, pages);

  return {
    robots,
    sitemap,
    https,
    jsGap
  };
}

module.exports = {
  runTechnicalChecks,
  parseRobotsTxt,
  checkRobotsTxt,
  checkSitemap,
  checkHttps,
  checkJsGap
};
