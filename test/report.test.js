const test = require('node:test');
const assert = require('node:assert');
const { renderReportHtml, generatePdf, getCompanySlug, generateSummaryText } = require('../src/services/report');
const { closeBrowser } = require('../src/services/browser');

test.after(async () => {
  await closeBrowser();
});

test('getCompanySlug converts company names into clean lowercase slugs', () => {
  assert.strictEqual(getCompanySlug('Acme Corp, Inc.'), 'acme-corp-inc');
  assert.strictEqual(getCompanySlug('  Special & Symbols #123  '), 'special-symbols-123');
  assert.strictEqual(getCompanySlug(''), 'audit');
  assert.strictEqual(getCompanySlug(null), 'audit');
});

test('generateSummaryText produces deterministic 3-sentence summary based on score and categories', () => {
  const categories = [
    { key: 'technical', label: 'Technical & Crawl Access', score: 25, max: 25 },
    { key: 'schema', label: 'Schema & Structured Data', score: 10, max: 25 }
  ];
  const summary = generateSummaryText(85, 'Strong', categories);
  assert.ok(summary.includes('strong readiness'));
  assert.ok(summary.includes('Technical & Crawl Access (100%)'));
  assert.ok(summary.includes('Schema & Structured Data (40%)'));
  assert.ok(summary.includes('Addressing the high-priority recommendations'));
});

test('renderReportHtml renders all sections, escapes dynamic text, and adheres to honesty rule', () => {
  const mockLead = {
    companyName: 'Evil <script>alert(1)</script> & Sons',
    website: 'https://evil.example.com?a=1&b=2'
  };

  const mockAudit = {
    domain: 'evil.example.com',
    status: 'done',
    result: {
      overallScore: 65,
      grade: 'Good',
      partial: true,
      categories: [
        { key: 'technical', label: 'Technical & Crawl Access', score: 18, max: 25 },
        { key: 'schema', label: 'Schema & Structured Data', score: 12, max: 25 }
      ],
      issues: [
        {
          severity: 'high',
          title: 'Missing <tag> in head',
          why: 'Why & because',
          fix: 'Fix <now>'
        }
      ],
      questions: [
        { question: 'Is this answered?', answered: true },
        { question: 'What is missing?', answered: false }
      ],
      pageSpeed: {
        performance: 80,
        seo: 90,
        accessibility: 85,
        bestPractices: 88,
        metrics: { lcp: '2.1s' }
      },
      pagesCrawled: ['https://evil.example.com/'],
      warnings: []
    }
  };

  const html = renderReportHtml(mockAudit, mockLead);

  // Escaping verification
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('Evil &lt;script&gt;alert(1)&lt;/script&gt; &amp; Sons'));
  assert.ok(html.includes('Missing &lt;tag&gt; in head'));

  // Required sections
  assert.ok(html.includes('AI Readiness Report'));
  assert.ok(html.includes('Executive Summary'));
  assert.ok(html.includes('Readiness Score by Area'));
  assert.ok(html.includes('Top Issues to Fix'));
  assert.ok(html.includes('Missing Customer Questions'));
  assert.ok(html.includes('Speed &amp; Technical Quality (Mobile)'));
  assert.ok(html.includes('Pages Audited'));
  assert.ok(html.includes('What This Score Means'));

  // Honesty statement
  assert.ok(
    html.includes(
      'This score shows how ready your website is. It cannot promise a place in Google AI Overviews or any AI answer.'
    )
  );

  // Partial note
  assert.ok(html.includes('Some checks could not be measured'));
});

test('renderReportHtml skips speed box when pageSpeed is missing or has error', () => {
  const mockLead = { companyName: 'No Speed Co', website: 'https://nospeed.com' };
  const mockAudit = {
    domain: 'nospeed.com',
    status: 'done',
    result: {
      overallScore: 50,
      grade: 'Basic',
      partial: false,
      categories: [],
      issues: [],
      questions: [],
      pageSpeed: { error: 'Quota exceeded' },
      pagesCrawled: [],
      warnings: []
    }
  };

  const html = renderReportHtml(mockAudit, mockLead);
  assert.ok(!html.includes('Google PageSpeed Insights'));
});

test('generatePdf generates a valid PDF buffer within A4 format', async () => {
  const mockLead = { companyName: 'PDF Unit Test Co', website: 'https://example.com' };
  const mockAudit = {
    domain: 'example.com',
    status: 'done',
    result: {
      overallScore: 92,
      grade: 'Strong',
      partial: false,
      categories: [{ key: 'technical', label: 'Technical', score: 25, max: 25 }],
      issues: [],
      questions: [],
      pagesCrawled: ['https://example.com/'],
      warnings: []
    }
  };

  const pdfBuffer = await generatePdf(mockAudit, mockLead);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 5000);
  assert.strictEqual(pdfBuffer.subarray(0, 4).toString(), '%PDF');
});

