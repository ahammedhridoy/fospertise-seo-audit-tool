const test = require('node:test');
const assert = require('node:assert');
const { auditInputSchema } = require('../src/validators');

test('auditInputSchema: accepts valid form input', () => {
  const input = {
    companyName: '  Fospertise Ltd  ',
    website: 'example.com',
    productsServices: 'SEO auditing and web software',
    industry: 'Technology',
    location: 'London, UK',
    email: '  Contact@Example.Com  ',
    consent: true
  };

  const parsed = auditInputSchema.parse(input);
  assert.strictEqual(parsed.companyName, 'Fospertise Ltd');
  assert.strictEqual(parsed.website, 'https://example.com');
  assert.strictEqual(parsed.productsServices, 'SEO auditing and web software');
  assert.strictEqual(parsed.industry, 'Technology');
  assert.strictEqual(parsed.location, 'London, UK');
  assert.strictEqual(parsed.email, 'contact@example.com');
  assert.strictEqual(parsed.consent, true);
  assert.strictEqual(parsed.company_website_2, '');
  assert.strictEqual(parsed.turnstileToken, '');
});

test('auditInputSchema: preserves existing https or http scheme', () => {
  const inputHttps = {
    companyName: 'Acme',
    website: 'https://mysite.org/subpage',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'info@mysite.org',
    consent: true
  };
  const parsed = auditInputSchema.parse(inputHttps);
  assert.strictEqual(parsed.website, 'https://mysite.org/subpage');
});

test('auditInputSchema: rejects invalid website address', () => {
  const input = {
    companyName: 'Acme',
    website: 'javascript:alert(1)',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'info@mysite.org',
    consent: true
  };
  assert.throws(() => auditInputSchema.parse(input));
});

test('auditInputSchema: rejects missing or false consent', () => {
  const input = {
    companyName: 'Acme',
    website: 'acme.com',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'info@acme.com',
    consent: false
  };
  assert.throws(() => auditInputSchema.parse(input));
});

test('auditInputSchema: rejects unknown keys', () => {
  const input = {
    companyName: 'Acme',
    website: 'acme.com',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'info@acme.com',
    consent: true,
    maliciousField: 'exploit'
  };
  assert.throws(() => auditInputSchema.parse(input));
});

test('auditInputSchema: rejects companyName out of range', () => {
  const shortInput = {
    companyName: 'A',
    website: 'acme.com',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'info@acme.com',
    consent: true
  };
  assert.throws(() => auditInputSchema.parse(shortInput));

  const longInput = {
    ...shortInput,
    companyName: 'A'.repeat(121)
  };
  assert.throws(() => auditInputSchema.parse(longInput));
});

test('auditInputSchema: rejects invalid email address', () => {
  const input = {
    companyName: 'Acme',
    website: 'acme.com',
    productsServices: 'Consulting services',
    industry: 'Consulting',
    location: 'Berlin',
    email: 'not-an-email',
    consent: true
  };
  assert.throws(() => auditInputSchema.parse(input));
});

