const test = require('node:test');
const assert = require('node:assert');
const { checkSchema } = require('../src/services/checks/schema');
const { checkStructure } = require('../src/services/checks/structure');
const { checkTrust } = require('../src/services/checks/trust');

const goodSitePages = [
  {
    url: 'https://example.com/',
    title: 'Acme Digital Agency - Premier Web Solutions', // 42 chars
    metaDescription: 'Acme provides professional web engineering and custom cloud applications for growing enterprises.', // 97 chars
    canonical: 'https://example.com/',
    h1: ['Premier Web Solutions for Business'],
    headingOrderOk: true,
    wordCount: 850,
    listCount: 3,
    tableCount: 1,
    imageCount: 5,
    imagesWithAlt: 5,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            'name': 'Acme',
            'url': 'https://example.com/'
          },
          {
            '@type': 'Organization',
            'name': 'Acme Digital Agency',
            'url': 'https://example.com/',
            'logo': 'https://example.com/logo.png',
            'sameAs': ['https://linkedin.com/company/acme', 'https://github.com/acme'],
            'contactPoint': {
              '@type': 'ContactPoint',
              'telephone': '+1-555-0199'
            }
          },
          {
            '@type': 'FAQPage',
            'mainEntity': [
              {
                '@type': 'Question',
                'name': 'What services do you offer?',
                'acceptedAnswer': { '@type': 'Answer', 'text': 'Web and cloud engineering.' }
              }
            ]
          }
        ]
      }
    ],
    jsonLdErrors: 0,
    phones: ['+1-555-0199'],
    emails: ['hello@example.com'],
    mainText: 'Welcome to Acme. 123 Tech Boulevard, Suite 400. Our team of experienced developers builds systems.',
    externalLinks: ['https://linkedin.com/company/acme', 'https://github.com/acme']
  },
  {
    url: 'https://example.com/about',
    title: 'About Acme Agency - Our Mission & Team', // 39 chars
    metaDescription: 'Learn about our passionate team of software developers, our history and engineering principles.', // 96 chars
    canonical: 'https://example.com/about',
    h1: ['About Acme Agency'],
    headingOrderOk: true,
    wordCount: 620,
    listCount: 2,
    tableCount: 0,
    imageCount: 3,
    imagesWithAlt: 3,
    jsonLd: [{ '@type': 'BreadcrumbList' }],
    jsonLdErrors: 0,
    phones: [],
    emails: [],
    mainText: 'Meet the team behind Acme. Leadership team includes industry veterans.',
    externalLinks: ['https://twitter.com/acme']
  },
  {
    url: 'https://example.com/contact',
    title: 'Contact Acme Agency - Get in Touch', // 34 chars
    metaDescription: 'Get in touch with our engineering team today for consultations, quotes and service inquiries.', // 93 chars
    canonical: 'https://example.com/contact',
    h1: ['Contact Our Team'],
    headingOrderOk: true,
    wordCount: 350,
    listCount: 1,
    tableCount: 0,
    imageCount: 1,
    imagesWithAlt: 1,
    jsonLd: [],
    jsonLdErrors: 0,
    phones: ['+1-555-0199'],
    emails: ['contact@example.com'],
    mainText: 'Contact us at 123 Tech Boulevard, Suite 400. Phone +1-555-0199.',
    externalLinks: []
  },
  {
    url: 'https://example.com/case-studies',
    title: 'Client Case Studies & Testimonials', // 35 chars
    metaDescription: 'Explore our client case studies and testimonials showing measurable business results and impact.', // 96 chars
    canonical: 'https://example.com/case-studies',
    h1: ['Case Studies and Results'],
    headingOrderOk: true,
    wordCount: 900,
    listCount: 4,
    tableCount: 2,
    imageCount: 4,
    imagesWithAlt: 4,
    jsonLd: [],
    jsonLdErrors: 0,
    phones: [],
    emails: [],
    mainText: 'Case studies and client testimonials detailing our successful digital transformation projects.',
    externalLinks: []
  },
  {
    url: 'https://example.com/privacy-policy',
    title: 'Privacy Policy - Acme Agency Info', // 33 chars
    metaDescription: 'Our official privacy policy explaining how customer data and privacy rights are protected.', // 91 chars
    canonical: 'https://example.com/privacy-policy',
    h1: ['Privacy Policy'],
    headingOrderOk: true,
    wordCount: 500,
    listCount: 1,
    tableCount: 0,
    imageCount: 0,
    imagesWithAlt: 0,
    jsonLd: [],
    jsonLdErrors: 0,
    phones: [],
    emails: [],
    mainText: 'Privacy Policy for Acme.',
    externalLinks: []
  },
  {
    url: 'https://example.com/terms',
    title: 'Terms of Service - Acme Services', // 32 chars
    metaDescription: 'Read the terms of service governing the use of Acme engineering and consultancy solutions.', // 91 chars
    canonical: 'https://example.com/terms',
    h1: ['Terms of Service'],
    headingOrderOk: true,
    wordCount: 500,
    listCount: 1,
    tableCount: 0,
    imageCount: 0,
    imagesWithAlt: 0,
    jsonLd: [],
    jsonLdErrors: 0,
    phones: [],
    emails: [],
    mainText: 'Terms of service agreement.',
    externalLinks: []
  }
];

const emptySitePages = [
  {
    url: 'https://empty-example.com/',
    title: 'Hi', // too short (< 30)
    metaDescription: '', // missing
    canonical: '',
    h1: ['Home', 'Extra H1'], // multiple H1
    headingOrderOk: false,
    wordCount: 40, // thin (< 250)
    listCount: 0,
    tableCount: 0,
    imageCount: 2,
    imagesWithAlt: 0,
    jsonLd: [],
    jsonLdErrors: 1,
    phones: [],
    emails: [],
    mainText: 'Just some placeholder text.',
    externalLinks: []
  }
];

// ─── Schema Tests ────────────────────────────────────────────────

test('checkSchema: evaluates rich site schema correctly', () => {
  const res = checkSchema(goodSitePages);
  assert.strictEqual(res.hasOrganization, true);
  assert.strictEqual(res.hasFAQPage, true);
  assert.strictEqual(res.hasServiceOrProductOrArticleOrWebSite, true);
  assert.strictEqual(res.hasBreadcrumb, true);
  assert.strictEqual(res.parseErrorCount, 0);
  assert.deepStrictEqual(res.organizationMissingFields, []);
  assert.ok(res.types.includes('Organization'));
  assert.ok(res.types.includes('WebSite'));
  assert.ok(res.types.includes('FAQPage'));
});

test('checkSchema: evaluates empty site schema correctly', () => {
  const res = checkSchema(emptySitePages);
  assert.strictEqual(res.hasOrganization, false);
  assert.strictEqual(res.hasFAQPage, false);
  assert.strictEqual(res.hasServiceOrProductOrArticleOrWebSite, false);
  assert.strictEqual(res.hasBreadcrumb, false);
  assert.strictEqual(res.parseErrorCount, 1);
  assert.deepStrictEqual(res.organizationMissingFields, ['name', 'url', 'logo', 'sameAs', 'contactPoint']);
  assert.deepStrictEqual(res.types, []);
});

// ─── Structure Tests ─────────────────────────────────────────────

test('checkStructure: evaluates good site structure correctly', () => {
  const res = checkStructure(goodSitePages);
  assert.strictEqual(res.h1Ok, 1);
  assert.strictEqual(res.headingOrderOkRatio, 1);
  assert.strictEqual(res.titleOkRatio, 1);
  assert.strictEqual(res.metaDescOkRatio, 1);
  assert.strictEqual(res.canonicalRatio, 1);
  assert.strictEqual(res.listOrTableRatio, 1);
  assert.strictEqual(res.imageAltRatio, 1);
  assert.ok(res.avgWords > 500);
  assert.deepStrictEqual(res.thinPages, []);
});

test('checkStructure: evaluates empty site structure correctly', () => {
  const res = checkStructure(emptySitePages);
  assert.strictEqual(res.h1Ok, 0);
  assert.strictEqual(res.headingOrderOkRatio, 0);
  assert.strictEqual(res.titleOkRatio, 0);
  assert.strictEqual(res.metaDescOkRatio, 0);
  assert.strictEqual(res.canonicalRatio, 0);
  assert.strictEqual(res.listOrTableRatio, 0);
  assert.strictEqual(res.imageAltRatio, 0);
  assert.strictEqual(res.avgWords, 40);
  assert.deepStrictEqual(res.thinPages, ['https://empty-example.com/']);
});

// ─── Trust Tests ─────────────────────────────────────────────────

test('checkTrust: evaluates good site trust signals correctly', () => {
  const res = checkTrust(goodSitePages);
  assert.strictEqual(res.aboutPage.found, true);
  assert.strictEqual(res.contactPage.found, true);
  assert.strictEqual(res.phone.found, true);
  assert.strictEqual(res.phone.evidence, '+1-555-0199');
  assert.strictEqual(res.email.found, true);
  assert.strictEqual(res.email.evidence, 'hello@example.com');
  assert.strictEqual(res.physicalAddress.found, true);
  assert.strictEqual(res.teamOrAuthor.found, true);
  assert.strictEqual(res.socialLinks.found, true);
  assert.ok(res.socialLinks.platforms.includes('linkedin'));
  assert.ok(res.socialLinks.platforms.includes('github'));
  assert.ok(res.socialLinks.platforms.includes('x'));
  assert.strictEqual(res.privacyPage.found, true);
  assert.strictEqual(res.termsPage.found, true);
  assert.strictEqual(res.testimonialsOrCaseStudies.found, true);
  assert.strictEqual(res.testimonialsOrCaseStudies.isFullSectionOrPage, true);
});

test('checkTrust: evaluates empty site trust signals correctly', () => {
  const res = checkTrust(emptySitePages);
  assert.strictEqual(res.aboutPage.found, false);
  assert.strictEqual(res.contactPage.found, false);
  assert.strictEqual(res.phone.found, false);
  assert.strictEqual(res.email.found, false);
  assert.strictEqual(res.physicalAddress.found, false);
  assert.strictEqual(res.teamOrAuthor.found, false);
  assert.strictEqual(res.socialLinks.found, false);
  assert.deepStrictEqual(res.socialLinks.platforms, []);
  assert.strictEqual(res.privacyPage.found, false);
  assert.strictEqual(res.termsPage.found, false);
  assert.strictEqual(res.testimonialsOrCaseStudies.found, false);
});
