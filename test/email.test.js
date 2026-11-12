const test = require('node:test');
const assert = require('node:assert');
const { buildEmailHtml, sendAuditReportEmail, getTransporter } = require('../src/services/email');

test('buildEmailHtml: renders valid HTML with score, grade, categories, and honesty notice', () => {
  const audit = {
    result: {
      overallScore: 78,
      grade: 'Good',
      categories: [
        { key: 'technical', label: 'Technical & Crawl Access', score: 20, max: 25 },
        { key: 'schema', label: 'Schema & Structure', score: 18, max: 25 },
        { key: 'content', label: 'Content Quality', score: 22, max: 30 },
        { key: 'trust', label: 'Trust & Credibility', score: 18, max: 20 }
      ],
      issues: [
        {
          severity: 'high',
          title: 'Organization schema is missing',
          why: 'Schema helps AI models identify the brand.',
          fix: 'Add Organization JSON-LD markup.'
        }
      ]
    }
  };

  const lead = {
    companyName: 'Acme Test Corp',
    website: 'https://acme-test.example.com',
    email: 'contact@acme-test.example.com'
  };

  const html = buildEmailHtml(audit, lead);

  assert(typeof html === 'string', 'HTML should be a string');
  assert(html.includes('Acme Test Corp'), 'Should contain company name');
  assert(html.includes('https://acme-test.example.com'), 'Should contain website URL');
  assert(html.includes('78'), 'Should contain overall score');
  assert(html.includes('Good'), 'Should contain grade');
  assert(html.includes('Technical &amp; Crawl Access') || html.includes('Technical & Crawl Access'), 'Should contain category labels');
  assert(!html.includes('Top Priority Recommendations'), 'Should not contain top priority section in email');
  assert(html.includes('This score shows how ready your website is. It cannot promise a place in Google AI Overviews or any AI answer.'), 'Should contain required honesty notice');
});

test('sendAuditReportEmail: returns failure if lead email is missing', async () => {
  const res = await sendAuditReportEmail({}, {});
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, 'No recipient email specified.');
});

test('getTransporter: returns transporter or null if unconfigured', () => {
  const transporter = getTransporter();
  // Either configured with SMTP or null
  assert(transporter !== undefined);
});

