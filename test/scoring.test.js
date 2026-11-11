const test = require('node:test');
const assert = require('node:assert');
const { calculateScore, getGrade } = require('../src/services/scoring');

const perfectInput = {
  technical: {
    robots: {
      exists: true,
      bots: {
        GPTBot: 'allowed',
        PerplexityBot: 'allowed',
        'Google-Extended': 'allowed',
        ClaudeBot: 'allowed',
        CCBot: 'allowed',
        Googlebot: 'allowed'
      }
    },
    sitemap: { exists: true, urlCount: 50 },
    https: { isHttps: true, httpRedirectsToHttps: true, homepageStatus: 200 },
    hasViewport: true,
    jsGap: { rawLength: 1000, renderedLength: 1000, ratio: 1 }
  },
  pageSpeed: {
    performance: 100,
    seo: 100
  },
  schema: {
    hasOrganization: true,
    organizationMissingFields: [],
    hasFAQPage: true,
    hasServiceOrProductOrArticleOrWebSite: true,
    types: ['Organization', 'FAQPage', 'Service'],
    parseErrorCount: 0
  },
  structure: {
    h1Ok: 1,
    headingOrderOkRatio: 1,
    titleOkRatio: 1,
    metaDescOkRatio: 1,
    canonicalRatio: 1,
    listOrTableRatio: 1,
    imageAltRatio: 1,
    hasViewport: true
  },
  content: {
    directAnswer: 10,
    specificFacts: 10,
    clarity: 10,
    originality: 10
  },
  questions: Array(15).fill({ question: 'q', answered: true }),
  trust: {
    aboutPage: { found: true },
    phone: { found: true },
    email: { found: true },
    physicalAddress: { found: true },
    contactPage: { found: true },
    hasForm: true,
    teamOrAuthor: { found: true },
    socialLinks: { platforms: ['linkedin', 'x'] },
    privacyPage: { found: true },
    termsPage: { found: true },
    testimonialsOrCaseStudies: { found: true, isFullSectionOrPage: true }
  }
};

const emptyInput = {
  technical: {
    robots: { exists: false, bots: {} },
    sitemap: { exists: false, urlCount: 0 },
    https: { isHttps: false, httpRedirectsToHttps: false, homepageStatus: 500 },
    hasViewport: false,
    jsGap: { rawLength: 0, renderedLength: 500, ratio: 0 }
  },
  pageSpeed: {
    performance: 10,
    seo: 20
  },
  schema: {
    hasOrganization: false,
    organizationMissingFields: ['name', 'url', 'logo', 'sameAs', 'contactPoint'],
    hasFAQPage: false,
    hasServiceOrProductOrArticleOrWebSite: false,
    types: [],
    parseErrorCount: 1
  },
  structure: {
    h1Ok: 0,
    headingOrderOkRatio: 0,
    titleOkRatio: 0,
    metaDescOkRatio: 0,
    canonicalRatio: 0,
    listOrTableRatio: 0,
    imageAltRatio: 0,
    hasViewport: false
  },
  content: {
    directAnswer: 1,
    specificFacts: 0,
    clarity: 1,
    originality: 1
  },
  questions: Array(15).fill({ question: 'q', answered: false }),
  trust: {
    aboutPage: { found: false },
    phone: { found: false },
    email: { found: false },
    physicalAddress: { found: false },
    contactPage: { found: false },
    hasForm: false,
    teamOrAuthor: { found: false },
    socialLinks: { platforms: [] },
    privacyPage: { found: false },
    termsPage: { found: false },
    testimonialsOrCaseStudies: { found: false }
  }
};

test('scoring: a perfect site scores 100 with Strong grade and 0 issues', () => {
  const result = calculateScore(perfectInput);
  assert.strictEqual(result.overallScore, 100);
  assert.strictEqual(result.grade, 'Strong');
  assert.strictEqual(result.partial, false);
  assert.strictEqual(result.issues.length, 0);

  const catMap = Object.fromEntries(result.categories.map((c) => [c.key, c]));
  assert.strictEqual(catMap.technical.score, 25);
  assert.strictEqual(catMap.technical.max, 25);
  assert.strictEqual(catMap.schema.score, 25);
  assert.strictEqual(catMap.schema.max, 25);
  assert.strictEqual(catMap.content.score, 30);
  assert.strictEqual(catMap.content.max, 30);
  assert.strictEqual(catMap.trust.score, 20);
  assert.strictEqual(catMap.trust.max, 20);
});

test('scoring: an empty site scores very low with Not Ready grade', () => {
  const result = calculateScore(emptyInput);
  assert.ok(result.overallScore < 20);
  assert.strictEqual(result.grade, 'Not Ready');
  assert.strictEqual(result.partial, false);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.length <= 10);

  // Issues are sorted by severity (high before medium before low)
  const severityRank = { high: 3, medium: 2, low: 1 };
  for (let i = 1; i < result.issues.length; i++) {
    assert.ok(
      severityRank[result.issues[i - 1].severity] >= severityRank[result.issues[i].severity],
      'Issues must be ordered by severity'
    );
  }
});

test('scoring: identical inputs yield identical deterministic output', () => {
  const result1 = calculateScore(perfectInput);
  const result2 = calculateScore(perfectInput);
  assert.deepStrictEqual(result1, result2);

  const emptyResult1 = calculateScore(emptyInput);
  const emptyResult2 = calculateScore(emptyInput);
  assert.deepStrictEqual(emptyResult1, emptyResult2);
});

test('scoring: missing PageSpeed scales correctly and sets partial true', () => {
  const missingPsInput = {
    ...perfectInput,
    pageSpeed: { error: 'Request timed out' }
  };

  const result = calculateScore(missingPsInput);
  assert.strictEqual(result.partial, true);
  assert.strictEqual(result.overallScore, 100);
  assert.ok(result.warnings.some((w) => w.includes('PageSpeed')));

  const catMap = Object.fromEntries(result.categories.map((c) => [c.key, c]));
  // technical max should be 25 - 6 (pagespeed) - 2 (mobile reduced to 1) = 17
  assert.strictEqual(catMap.technical.max, 17);
  assert.strictEqual(catMap.technical.score, 17);

  const psItem = catMap.technical.items.find((i) => i.key === 'pagespeed');
  assert.strictEqual(psItem.score, null);
  const mobileItem = catMap.technical.items.find((i) => i.key === 'mobile');
  assert.strictEqual(mobileItem.max, 1);
});

test('getGrade: maps scores correctly to letter grades', () => {
  assert.strictEqual(getGrade(100), 'Strong');
  assert.strictEqual(getGrade(80), 'Strong');
  assert.strictEqual(getGrade(79), 'Good');
  assert.strictEqual(getGrade(60), 'Good');
  assert.strictEqual(getGrade(59), 'Basic');
  assert.strictEqual(getGrade(40), 'Basic');
  assert.strictEqual(getGrade(39), 'Not Ready');
  assert.strictEqual(getGrade(0), 'Not Ready');
});

