const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const app = require('../server');

test('GET / serves public/index.html with Bootstrap and all required controls', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;

  const res = await fetch(url);
  assert.strictEqual(res.status, 200);
  const html = await res.text();

  // CDN & title
  assert.match(html, /bootstrap@5/i);
  assert.match(html, /AI Readiness Checker/i);

  // Required form fields
  assert.match(html, /id="companyName"/);
  assert.match(html, /id="website"/);
  assert.match(html, /id="productsServices"/);
  assert.match(html, /id="industry"/);
  assert.match(html, /id="location"/);
  assert.match(html, /id="email"/);
  assert.match(html, /id="consent"/);

  // Honeypot field
  assert.match(html, /name="company_website_2"/);

  // Submit button text
  assert.match(html, /Run Audit<\/button>/);

  // Result and PDF button
  assert.match(html, /Download PDF Report/);
  assert.match(html, /progressBar/);
  assert.match(html, /progressStage/);

  // Script checks
  assert.match(html, /const API_BASE = '';/);
  assert.doesNotMatch(html, /\.innerHTML\b/);
});

