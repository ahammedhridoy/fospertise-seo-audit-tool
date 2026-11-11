const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, closeDB } = require('../src/db');
const { closeBrowser } = require('../src/services/browser');
const Audit = require('../src/models/Audit');
const Lead = require('../src/models/Lead');

let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  server = app.listen(0);
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  if (server) server.close();
  await closeBrowser();
  await closeDB();
});

test('POST /api/audits: honeypot returns fake 202 and does not save a Lead', async () => {
  const initialLeads = await Lead.countDocuments({ email: 'bot@spammer.com' });

  const res = await fetch(`${baseUrl}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'Bot Co',
      website: 'example.com',
      productsServices: 'Spamming services',
      industry: 'Spam',
      location: 'Nowhere',
      email: 'bot@spammer.com',
      consent: true,
      company_website_2: 'http://honeypot-trap.com'
    })
  });

  assert.strictEqual(res.status, 202);
  const data = await res.json();
  assert.strictEqual(data.status, 'queued');
  assert.ok(data.auditId);

  const finalLeads = await Lead.countDocuments({ email: 'bot@spammer.com' });
  assert.strictEqual(finalLeads, initialLeads);
});

test('POST /api/audits: rejects private IP addresses with 400', async () => {
  const res = await fetch(`${baseUrl}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'Private Co',
      website: 'http://127.0.0.1',
      productsServices: 'Internal testing services',
      industry: 'Software',
      location: 'Localhost',
      email: 'test@internal.com',
      consent: true
    })
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.code, 'PRIVATE_HOST');
  assert.strictEqual(data.error, 'This address cannot be checked.');
});

test('POST /api/audits: rejects invalid input schema with 400', async () => {
  const res = await fetch(`${baseUrl}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'A', // too short
      website: 'not a url',
      consent: false
    })
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test('GET /api/audits/:id: returns 404 for invalid ObjectId', async () => {
  const res = await fetch(`${baseUrl}/api/audits/invalid-object-id`);
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.strictEqual(data.code, 'NOT_FOUND');
});

test('GET /api/audits/:id: returns 404 for non-existent audit', async () => {
  const fakeId = new mongoose.Types.ObjectId().toString();
  const res = await fetch(`${baseUrl}/api/audits/${fakeId}`);
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.strictEqual(data.code, 'NOT_FOUND');
});

test('GET /api/audits/:id: never returns email address', async () => {
  const lead = await Lead.create({
    companyName: 'Secret Lead Co',
    website: 'https://example.com',
    productsServices: 'Secure enterprise communications',
    industry: 'Security',
    location: 'Zurich',
    email: 'strictly-confidential@secret.com',
    consent: true
  });

  const audit = await Audit.create({
    leadId: lead._id,
    domain: 'example.com',
    status: 'running',
    progress: 40,
    stage: 'Technical checks'
  });

  const res = await fetch(`${baseUrl}/api/audits/${audit._id}`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.id, audit._id.toString());
  assert.strictEqual(data.status, 'running');
  assert.strictEqual(data.progress, 40);
  assert.strictEqual(data.stage, 'Technical checks');
  assert.strictEqual(data.companyName, 'Secret Lead Co');
  assert.strictEqual(data.website, 'https://example.com');
  assert.strictEqual(data.email, undefined);

  // Clean up
  await Audit.findByIdAndDelete(audit._id);
  await Lead.findByIdAndDelete(lead._id);
});

test('POST /api/audits: returns cached 200 when done audit exists within 24h', async () => {
  const domain = 'example.com';

  const oldLead = await Lead.create({
    companyName: 'Old Co',
    website: `https://${domain}`,
    productsServices: 'Web services',
    industry: 'Software',
    location: 'SF',
    email: 'old@test.com',
    consent: true
  });

  const oldAudit = await Audit.create({
    leadId: oldLead._id,
    domain,
    status: 'done',
    progress: 100,
    stage: 'Done',
    result: { overallScore: 88, grade: 'Strong', categories: [] },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
  });

  const res = await fetch(`${baseUrl}/api/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'New Lead for Same Site',
      website: `https://${domain}`,
      productsServices: 'Web services',
      industry: 'Software',
      location: 'SF',
      email: 'new@test.com',
      consent: true
    })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'done');
  assert.strictEqual(data.cached, true);
  assert.notStrictEqual(data.auditId, oldAudit._id.toString()); // New document created

  // Verify new document has copied result and new company name
  const newAudit = await Audit.findById(data.auditId);
  assert.strictEqual(newAudit.status, 'done');
  assert.strictEqual(newAudit.result.overallScore, 88);

  const newLead = await Lead.findById(newAudit.leadId);
  assert.strictEqual(newLead.companyName, 'New Lead for Same Site');

  // Clean up
  await Audit.findByIdAndDelete(oldAudit._id);
  await Audit.findByIdAndDelete(newAudit._id);
  await Lead.findByIdAndDelete(oldLead._id);
  await Lead.findByIdAndDelete(newLead._id);
});

test('GET /api/audits/:id/pdf: returns 409 when audit is not done yet', async () => {
  const lead = await Lead.create({
    companyName: 'Pending PDF Co',
    website: 'https://example.com',
    productsServices: 'Pending audit',
    industry: 'Software',
    location: 'NY',
    email: 'pending@test.com',
    consent: true
  });

  const audit = await Audit.create({
    leadId: lead._id,
    domain: 'example.com',
    status: 'running',
    progress: 50,
    stage: 'Speed test'
  });

  const res = await fetch(`${baseUrl}/api/audits/${audit._id}/pdf`);
  assert.strictEqual(res.status, 409);
  const data = await res.json();
  assert.strictEqual(data.code, 'NOT_READY');
  assert.strictEqual(data.error, 'The report is not ready yet.');

  // Clean up
  await Audit.findByIdAndDelete(audit._id);
  await Lead.findByIdAndDelete(lead._id);
});

test('GET /api/audits/:id/pdf: returns 200 and generates PDF with attachment header when done', async () => {
  const lead = await Lead.create({
    companyName: 'Acme PDF Test Co',
    website: 'https://example.com',
    productsServices: 'Software development',
    industry: 'Technology',
    location: 'Berlin',
    email: 'pdf@test.com',
    consent: true
  });

  const audit = await Audit.create({
    leadId: lead._id,
    domain: 'example.com',
    status: 'done',
    progress: 100,
    stage: 'Done',
    result: {
      overallScore: 85,
      grade: 'Strong',
      partial: false,
      categories: [
        { key: 'technical', label: 'Technical & Crawl Access', score: 20, max: 25 },
        { key: 'schema', label: 'Schema & Structured Data', score: 22, max: 25 },
        { key: 'content', label: 'Content Quality & AI Answers', score: 21, max: 25 },
        { key: 'trust', label: 'Trust & Business Identity', score: 22, max: 25 }
      ],
      issues: [
        {
          severity: 'medium',
          title: 'Missing FAQ schema',
          why: 'Helps AI answer engines.',
          fix: 'Add FAQPage JSON-LD.'
        }
      ],
      questions: [
        { question: 'What does Acme do?', answered: true },
        { question: 'How much does it cost?', answered: false }
      ],
      pagesCrawled: ['https://example.com/'],
      warnings: []
    }
  });

  const res = await fetch(`${baseUrl}/api/audits/${audit._id}/pdf`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(
    res.headers.get('content-disposition'),
    'attachment; filename="acme-pdf-test-co-ai-readiness-report.pdf"'
  );

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // PDF magic header %PDF-
  assert.ok(buffer.length > 1000);
  assert.strictEqual(buffer.subarray(0, 4).toString(), '%PDF');

  // Clean up
  await Audit.findByIdAndDelete(audit._id);
  await Lead.findByIdAndDelete(lead._id);
});

