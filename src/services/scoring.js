/**
 * Scoring engine for the AI Readiness Checker.
 * Pure and deterministic calculation based on docs/SPEC.md §11 and §12.
 */

const ISSUES_LOOKUP = {
  ai_bot_access: {
    title: 'AI bots are blocked',
    why: 'AI tools cannot read pages they are blocked from.',
    fix: 'Remove the Disallow rules for GPTBot, PerplexityBot, Google-Extended, ClaudeBot and CCBot in robots.txt.'
  },
  sitemap: {
    title: 'No working sitemap',
    why: 'A sitemap helps bots find all your pages.',
    fix: 'Create sitemap.xml, list your main pages and add it to robots.txt.'
  },
  https: {
    title: 'Website is not fully on HTTPS',
    why: 'Insecure sites lose trust and ranking.',
    fix: 'Install an SSL certificate and redirect all http pages to https.'
  },
  pagespeed: {
    title: 'Website loads slowly on mobile',
    why: 'Slow pages are skipped by users and bots.',
    fix: 'Compress images, remove unused scripts, use caching and a CDN.'
  },
  mobile: {
    title: 'Mobile setup is weak',
    why: 'Most visitors use phones.',
    fix: 'Add the viewport meta tag and fix the mobile issues in the speed report.'
  },
  js_content: {
    title: 'Content is hidden behind JavaScript',
    why: 'Many AI bots do not run JavaScript, so they see an empty page.',
    fix: 'Render the main text on the server (SSR or static HTML).'
  },
  org_schema: {
    title: 'Company schema is missing or incomplete',
    why: 'Schema tells AI who you are.',
    fix: 'Add Organization JSON-LD with name, url, logo, sameAs and contactPoint.'
  },
  faq_schema: {
    title: 'No FAQ schema',
    why: 'AI tools pick up short question and answer blocks easily.',
    fix: 'Add an FAQ section and mark it with FAQPage JSON-LD.'
  },
  other_schema: {
    title: 'No service or content schema',
    why: 'Schema explains what each page is about.',
    fix: 'Add Service, WebSite or Article JSON-LD to the matching pages.'
  },
  schema_valid: {
    title: 'Schema has errors or is missing',
    why: 'Broken schema is ignored.',
    fix: 'Fix the JSON-LD with a schema validator.'
  },
  h1: {
    title: 'Pages do not have exactly one H1',
    why: 'The H1 tells AI the page topic.',
    fix: 'Use one clear H1 on every page.'
  },
  heading_order: {
    title: 'Heading order is broken',
    why: 'A clean outline is easier to read for bots.',
    fix: 'Use H1, H2, H3 in order without skipping levels.'
  },
  title_meta: {
    title: 'Titles or descriptions are missing or badly sized',
    why: 'They are the first thing search and AI tools read.',
    fix: 'Write a title of 30 to 65 characters and a description of 70 to 160 characters for each page.'
  },
  canonical: {
    title: 'Canonical tags are missing',
    why: 'They prevent duplicate-page confusion.',
    fix: 'Add a canonical link tag to every page.'
  },
  lists_tables: {
    title: 'Few lists or tables',
    why: 'AI likes short, structured blocks.',
    fix: 'Use bullet lists, steps and tables for key information.'
  },
  image_alt: {
    title: 'Images are missing alt text',
    why: 'Alt text explains images to bots.',
    fix: 'Add short, clear alt text to images.'
  },
  direct_answer: {
    title: 'Pages do not answer questions directly',
    why: 'AI quotes pages that answer in the first lines.',
    fix: 'Start each page with a clear 2 to 3 line answer to the main question.'
  },
  specific_facts: {
    title: 'Content has few concrete facts',
    why: 'Numbers and examples make content worth quoting.',
    fix: 'Add prices, numbers, named examples and case studies.'
  },
  clarity: {
    title: 'It is not clear what you offer',
    why: 'AI cannot recommend what it cannot understand.',
    fix: 'State your services clearly on the homepage and services pages, using the words customers search for.'
  },
  question_coverage: {
    title: 'Customer questions are not answered',
    why: 'Missing answers mean missing chances to be cited.',
    fix: 'Write pages or FAQ answers for the missing questions listed in this report.'
  },
  originality: {
    title: 'Content feels generic',
    why: 'AI prefers original, useful content.',
    fix: 'Add your own experience, data and opinions.'
  },
  about_page: {
    title: 'No About page',
    why: 'Trust signals help AI trust you.',
    fix: 'Add an About page with your story, team and experience.'
  },
  contact_info: {
    title: 'Contact details are incomplete',
    why: 'Real contact details build trust.',
    fix: 'Show phone, email and address on the Contact page and in the footer.'
  },
  team_author: {
    title: 'No team or author information',
    why: 'AI looks for real people behind a site.',
    fix: 'Add a Team page and author names on articles.'
  },
  social: {
    title: 'Few social profiles linked',
    why: 'Social profiles confirm your identity.',
    fix: 'Link your LinkedIn, GitHub and other official profiles.'
  },
  legal_pages: {
    title: 'Privacy or Terms page missing',
    why: 'Legal pages are a basic trust sign.',
    fix: 'Add Privacy Policy and Terms pages and link them in the footer.'
  },
  social_proof: {
    title: 'No reviews or case studies',
    why: 'Proof makes claims believable.',
    fix: 'Add testimonials, reviews and case studies.'
  }
};

const SEVERITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1
};

function round1(val) {
  if (val === null || val === undefined) return null;
  return Number(val.toFixed(1));
}

function getRating(item) {
  if (typeof item === 'number') return Math.max(0, Math.min(10, item));
  if (item && typeof item.score === 'number') return Math.max(0, Math.min(10, item.score));
  return 0;
}

function getReason(item) {
  if (item && typeof item.reason === 'string') return item.reason;
  return '';
}

/**
 * Determine grade from score (0-100).
 */
function getGrade(score) {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Basic';
  return 'Not Ready';
}

/**
 * Calculate scores, grade, and issues from check outputs.
 *
 * @param {object} input
 * @param {object} input.technical
 * @param {object} [input.pageSpeed]
 * @param {object} input.schema
 * @param {object} input.structure
 * @param {object} input.trust
 * @param {object} [input.content]
 * @param {Array|object} [input.questions]
 * @returns {object} Result object matching SPEC.md §7.3
 */
function calculateScore({
  technical = {},
  pageSpeed = null,
  schema = {},
  structure = {},
  trust = {},
  content = null,
  questions = null
} = {}) {
  const warnings = [];
  let isPartial = false;

  const hasPageSpeedError = !pageSpeed || Boolean(pageSpeed.error);
  if (hasPageSpeedError) {
    isPartial = true;
    warnings.push('PageSpeed test was unavailable. Mobile speed was omitted and mobile setup was scored on viewport only.');
  }

  const hasContentError = !content || Boolean(content.error);
  if (hasContentError) {
    isPartial = true;
    warnings.push('AI content review was unavailable. Content quality items could not be evaluated.');
  }

  const hasQuestionsError = !questions || Boolean(questions.error) || !Array.isArray(questions);
  if (hasQuestionsError) {
    isPartial = true;
    warnings.push('AI customer question coverage could not be evaluated.');
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Technical & Crawl Access (25 points)
  // ─────────────────────────────────────────────────────────────
  const technicalItems = [];

  // 1.1 ai_bot_access (6 pts)
  let aiBotScore = 6;
  const bots = technical.robots?.bots || {};
  const robotsExists = technical.robots?.exists ?? false;

  if (!robotsExists) {
    aiBotScore = 4;
  } else if (bots.Googlebot === 'blocked' || Object.values(bots).every((s) => s === 'blocked')) {
    aiBotScore = 0;
  } else {
    const aiBots = ['GPTBot', 'PerplexityBot', 'Google-Extended', 'ClaudeBot', 'CCBot'];
    const blockedCount = aiBots.filter((b) => bots[b] === 'blocked').length;
    if (blockedCount === 0) aiBotScore = 6;
    else if (blockedCount <= 2) aiBotScore = 3;
    else aiBotScore = 1;
  }
  technicalItems.push({
    key: 'ai_bot_access',
    label: 'AI bot access',
    score: round1(aiBotScore),
    max: 6,
    note: ''
  });

  // 1.2 sitemap (4 pts)
  let sitemapScore = 0;
  if (technical.sitemap?.exists) {
    const count = technical.sitemap.urlCount || (technical.sitemap.urls ? technical.sitemap.urls.length : 0);
    sitemapScore = count > 0 ? 4 : 2;
  }
  technicalItems.push({
    key: 'sitemap',
    label: 'Sitemap',
    score: round1(sitemapScore),
    max: 4,
    note: ''
  });

  // 1.3 https (3 pts)
  let httpsScore = 0;
  if (technical.https?.isHttps) httpsScore += 1;
  if (technical.https?.httpRedirectsToHttps) httpsScore += 1;
  if (technical.https?.homepageStatus === 200) httpsScore += 1;
  technicalItems.push({
    key: 'https',
    label: 'HTTPS & SSL',
    score: round1(httpsScore),
    max: 3,
    note: ''
  });

  // 1.4 pagespeed (6 pts)
  if (hasPageSpeedError) {
    technicalItems.push({
      key: 'pagespeed',
      label: 'Mobile PageSpeed',
      score: null,
      max: 6,
      note: 'PageSpeed data unavailable'
    });
  } else {
    const perfScore = typeof pageSpeed.performance === 'number' ? pageSpeed.performance : 0;
    const psScore = (perfScore / 100) * 6;
    technicalItems.push({
      key: 'pagespeed',
      label: 'Mobile PageSpeed',
      score: round1(psScore),
      max: 6,
      note: ''
    });
  }

  // 1.5 mobile (3 pts, or 1 pt if PageSpeed failed)
  const hasViewport = Boolean(technical.hasViewport || structure.hasViewport);
  if (hasPageSpeedError) {
    technicalItems.push({
      key: 'mobile',
      label: 'Mobile friendliness',
      score: hasViewport ? 1 : 0,
      max: 1,
      note: 'Scored on viewport only (PageSpeed unavailable)'
    });
  } else {
    let mobileScore = hasViewport ? 1 : 0;
    const seoScore = typeof pageSpeed.seo === 'number' ? pageSpeed.seo : 0;
    if (seoScore >= 90) mobileScore += 2;
    else if (seoScore >= 50) mobileScore += 1;

    technicalItems.push({
      key: 'mobile',
      label: 'Mobile friendliness',
      score: round1(mobileScore),
      max: 3,
      note: ''
    });
  }

  // 1.6 js_content (3 pts)
  let jsContentScore = 3;
  if (technical.jsGap) {
    const { rawLength = 0, renderedLength = 0, ratio = 1 } = technical.jsGap;
    if (renderedLength < 200) {
      jsContentScore = 3;
    } else if (ratio >= 0.8) {
      jsContentScore = 3;
    } else if (ratio >= 0.5) {
      jsContentScore = 1.5;
    } else {
      jsContentScore = 0;
    }
  }
  technicalItems.push({
    key: 'js_content',
    label: 'JavaScript content accessibility',
    score: round1(jsContentScore),
    max: 3,
    note: ''
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Schema & Structure (25 points)
  // ─────────────────────────────────────────────────────────────
  const schemaItems = [];

  // 2.1 org_schema (5 pts)
  let orgScore = 0;
  if (schema.hasOrganization) {
    orgScore = 3;
    const missing = Array.isArray(schema.organizationMissingFields)
      ? schema.organizationMissingFields
      : [];
    const completeCount = Math.max(0, 5 - missing.length);
    orgScore += completeCount * 0.4;
  }
  schemaItems.push({
    key: 'org_schema',
    label: 'Organization schema',
    score: round1(orgScore),
    max: 5,
    note: ''
  });

  // 2.2 faq_schema (4 pts)
  schemaItems.push({
    key: 'faq_schema',
    label: 'FAQ schema',
    score: schema.hasFAQPage ? 4 : 0,
    max: 4,
    note: ''
  });

  // 2.3 other_schema (4 pts)
  schemaItems.push({
    key: 'other_schema',
    label: 'Service & article schema',
    score: schema.hasServiceOrProductOrArticleOrWebSite ? 4 : 0,
    max: 4,
    note: ''
  });

  // 2.4 schema_valid (2 pts)
  let schemaValidScore = 0;
  if (schema.types && schema.types.length > 0 && (schema.parseErrorCount === 0 || !schema.parseErrorCount)) {
    schemaValidScore = 2;
  }
  schemaItems.push({
    key: 'schema_valid',
    label: 'Schema syntax validity',
    score: schemaValidScore,
    max: 2,
    note: ''
  });

  // 2.5 h1 (2 pts)
  const h1Score = (structure.h1Ok || 0) * 2;
  schemaItems.push({
    key: 'h1',
    label: 'H1 tags structure',
    score: round1(h1Score),
    max: 2,
    note: ''
  });

  // 2.6 heading_order (2 pts)
  const headingOrderScore = (structure.headingOrderOkRatio || 0) * 2;
  schemaItems.push({
    key: 'heading_order',
    label: 'Heading hierarchy',
    score: round1(headingOrderScore),
    max: 2,
    note: ''
  });

  // 2.7 title_meta (2 pts)
  const titleMetaRatio = ((structure.titleOkRatio || 0) + (structure.metaDescOkRatio || 0)) / 2;
  schemaItems.push({
    key: 'title_meta',
    label: 'Title & meta descriptions',
    score: round1(titleMetaRatio * 2),
    max: 2,
    note: ''
  });

  // 2.8 canonical (1 pt)
  const canonicalScore = (structure.canonicalRatio || 0) * 1;
  schemaItems.push({
    key: 'canonical',
    label: 'Canonical links',
    score: round1(canonicalScore),
    max: 1,
    note: ''
  });

  // 2.9 lists_tables (2 pts)
  const listsTablesRatio = Math.min(1, (structure.listOrTableRatio || 0) / 0.5);
  schemaItems.push({
    key: 'lists_tables',
    label: 'Lists & tables structured data',
    score: round1(listsTablesRatio * 2),
    max: 2,
    note: ''
  });

  // 2.10 image_alt (1 pt)
  const imgAltRatio = structure.imageAltRatio ?? 1;
  schemaItems.push({
    key: 'image_alt',
    label: 'Image alt attributes',
    score: round1(imgAltRatio * 1),
    max: 1,
    note: ''
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Content Quality (30 points)
  // ─────────────────────────────────────────────────────────────
  const contentItems = [];

  // 3.1 direct_answer (8 pts)
  if (hasContentError) {
    contentItems.push({
      key: 'direct_answer',
      label: 'Direct answer opening',
      score: null,
      max: 8,
      note: 'Content review unavailable'
    });
  } else {
    const daRating = getRating(content.directAnswer);
    contentItems.push({
      key: 'direct_answer',
      label: 'Direct answer opening',
      score: round1((daRating / 10) * 8),
      max: 8,
      note: getReason(content.directAnswer)
    });
  }

  // 3.2 specific_facts (8 pts)
  if (hasContentError) {
    contentItems.push({
      key: 'specific_facts',
      label: 'Specific facts & metrics',
      score: null,
      max: 8,
      note: 'Content review unavailable'
    });
  } else {
    const sfRating = getRating(content.specificFacts);
    contentItems.push({
      key: 'specific_facts',
      label: 'Specific facts & metrics',
      score: round1((sfRating / 10) * 8),
      max: 8,
      note: getReason(content.specificFacts)
    });
  }

  // 3.3 clarity (6 pts)
  if (hasContentError) {
    contentItems.push({
      key: 'clarity',
      label: 'Service offering clarity',
      score: null,
      max: 6,
      note: 'Content review unavailable'
    });
  } else {
    const cRating = getRating(content.clarity);
    contentItems.push({
      key: 'clarity',
      label: 'Service offering clarity',
      score: round1((cRating / 10) * 6),
      max: 6,
      note: getReason(content.clarity)
    });
  }

  // 3.4 question_coverage (4 pts)
  if (hasQuestionsError) {
    contentItems.push({
      key: 'question_coverage',
      label: 'Customer question coverage',
      score: null,
      max: 4,
      note: 'Question coverage unavailable'
    });
  } else {
    const totalQ = questions.length || 15;
    const answeredCount = questions.filter((q) => q.answered).length;
    const qcScore = (answeredCount / totalQ) * 4;
    contentItems.push({
      key: 'question_coverage',
      label: 'Customer question coverage',
      score: round1(qcScore),
      max: 4,
      note: `${answeredCount}/${totalQ} questions answered`
    });
  }

  // 3.5 originality (4 pts)
  if (hasContentError) {
    contentItems.push({
      key: 'originality',
      label: 'Content originality & insight',
      score: null,
      max: 4,
      note: 'Content review unavailable'
    });
  } else {
    const oRating = getRating(content.originality);
    contentItems.push({
      key: 'originality',
      label: 'Content originality & insight',
      score: round1((oRating / 10) * 4),
      max: 4,
      note: getReason(content.originality)
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Trust & Credibility (20 points)
  // ─────────────────────────────────────────────────────────────
  const trustItems = [];

  // 4.1 about_page (4 pts)
  trustItems.push({
    key: 'about_page',
    label: 'About page',
    score: trust.aboutPage?.found ? 4 : 0,
    max: 4,
    note: ''
  });

  // 4.2 contact_info (5 pts)
  let contactScore = 0;
  if (trust.phone?.found) contactScore += 1.5;
  if (trust.email?.found) contactScore += 1.5;
  if (trust.physicalAddress?.found) contactScore += 1.5;
  if (trust.contactPage?.found || trust.hasForm) contactScore += 0.5;
  trustItems.push({
    key: 'contact_info',
    label: 'Contact information completeness',
    score: round1(contactScore),
    max: 5,
    note: ''
  });

  // 4.3 team_author (3 pts)
  trustItems.push({
    key: 'team_author',
    label: 'Team & author transparency',
    score: trust.teamOrAuthor?.found ? 3 : 0,
    max: 3,
    note: ''
  });

  // 4.4 social (2 pts)
  let socialScore = 0;
  const platformCount = trust.socialLinks?.platforms?.length || 0;
  if (platformCount >= 2) socialScore = 2;
  else if (platformCount === 1) socialScore = 1;
  trustItems.push({
    key: 'social',
    label: 'Social profile links',
    score: socialScore,
    max: 2,
    note: ''
  });

  // 4.5 legal_pages (2 pts)
  let legalScore = 0;
  const hasPrivacy = Boolean(trust.privacyPage?.found);
  const hasTerms = Boolean(trust.termsPage?.found);
  if (hasPrivacy && hasTerms) legalScore = 2;
  else if (hasPrivacy || hasTerms) legalScore = 1;
  trustItems.push({
    key: 'legal_pages',
    label: 'Legal policies (Privacy & Terms)',
    score: legalScore,
    max: 2,
    note: ''
  });

  // 4.6 social_proof (4 pts)
  let socialProofScore = 0;
  if (trust.testimonialsOrCaseStudies?.found) {
    socialProofScore = trust.testimonialsOrCaseStudies.isFullSectionOrPage ? 4 : 2;
  }
  trustItems.push({
    key: 'social_proof',
    label: 'Testimonials & case studies',
    score: socialProofScore,
    max: 4,
    note: ''
  });

  // ─────────────────────────────────────────────────────────────
  // Aggregate Categories
  // ─────────────────────────────────────────────────────────────
  const categoriesDef = [
    { key: 'technical', label: 'Technical & Crawl Access', items: technicalItems },
    { key: 'schema', label: 'Schema & Structure', items: schemaItems },
    { key: 'content', label: 'Content Quality', items: contentItems },
    { key: 'trust', label: 'Trust & Credibility', items: trustItems }
  ];

  let totalMeasuredScore = 0;
  let totalMeasuredMax = 0;

  const categories = categoriesDef.map((cat) => {
    let catScore = 0;
    let catMax = 0;

    for (const item of cat.items) {
      if (item.score !== null) {
        catScore += item.score;
        catMax += item.max;
        totalMeasuredScore += item.score;
        totalMeasuredMax += item.max;
      }
    }

    return {
      key: cat.key,
      label: cat.label,
      score: round1(catScore),
      max: catMax,
      items: cat.items
    };
  });

  // Calculate overall score (scaled to 100 if partial)
  let overallScore = 0;
  if (totalMeasuredMax > 0) {
    overallScore = Math.round((totalMeasuredScore / totalMeasuredMax) * 100);
    overallScore = Math.max(0, Math.min(100, overallScore));
  }

  const grade = getGrade(overallScore);

  // ─────────────────────────────────────────────────────────────
  // Build Issues List (§12)
  // ─────────────────────────────────────────────────────────────
  const allIssues = [];

  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.score === null) continue; // Unmeasured items do not generate deduction issues

      const pointsLost = Number((item.max - item.score).toFixed(1));
      if (pointsLost > 0) {
        const pctLost = pointsLost / item.max;
        let severity = 'low';
        if (pctLost >= 0.6 && item.max >= 5) {
          severity = 'high';
        } else if (pctLost >= 0.4) {
          severity = 'medium';
        }

        const lookup = ISSUES_LOOKUP[item.key] || {
          title: item.label,
          why: 'Improve this area to boost search and AI engine understanding.',
          fix: 'Review and improve the corresponding section.'
        };

        // If page where it fails is known
        let page = null;
        if (item.key === 'h1' || item.key === 'title_meta') {
          page = structure.thinPages && structure.thinPages.length > 0 ? structure.thinPages[0] : null;
        }

        allIssues.push({
          severity,
          category: cat.key,
          title: lookup.title,
          why: lookup.why,
          fix: lookup.fix,
          page,
          pointsLost
        });
      }
    }
  }

  // Sort by severity (high, medium, low), then by points lost descending
  allIssues.sort((a, b) => {
    const sevDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.pointsLost - a.pointsLost;
  });

  // Keep top 10 and remove internal sorting property pointsLost
  const top10Issues = allIssues.slice(0, 10).map(({ pointsLost, ...rest }) => rest);

  return {
    overallScore,
    grade,
    partial: isPartial,
    categories,
    issues: top10Issues,
    warnings
  };
}

module.exports = {
  calculateScore,
  getGrade,
  ISSUES_LOOKUP
};
