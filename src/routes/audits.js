const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Audit = require('../models/Audit');
const Lead = require('../models/Lead');
const { auditInputSchema } = require('../validators');
const { normalizeUrl, assertPublicHost } = require('../services/urlGuard');
const { verifyTurnstile } = require('../services/turnstile');
const { queueAudit } = require('../jobs/runAudit');
const { generatePdf, getCompanySlug } = require('../services/report');
const { sendAuditReportEmail } = require('../services/email');

const router = express.Router();

// Rate limiters (§10.2)
const postAuditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests. Please wait a while and try again.',
      code: 'RATE_LIMIT'
    });
  }
});

const getAuditLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests. Please wait a while and try again.',
      code: 'RATE_LIMIT'
    });
  }
});

/**
 * POST /api/audits
 * Create a lead and queue or return a cached audit.
 */
router.post('/audits', postAuditLimiter, async (req, res, next) => {
  try {
    // 1. Honeypot check: If company_website_2 is filled, return fake 202 success
    if (req.body && req.body.company_website_2 && String(req.body.company_website_2).trim() !== '') {
      const fakeAuditId = new mongoose.Types.ObjectId().toString();
      return res.status(202).json({
        auditId: fakeAuditId,
        status: 'queued'
      });
    }

    // 2. Validate input schema with Zod
    const parsed = auditInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Please check the form input.';
      return res.status(400).json({
        error: firstError,
        code: 'VALIDATION_ERROR'
      });
    }

    const { companyName, productsServices, industry, location, email, consent, turnstileToken } =
      parsed.data;

    // 3. Cloudflare Turnstile verification (if configured)
    const turnstileOk = await verifyTurnstile(turnstileToken, req.ip);
    if (!turnstileOk) {
      return res.status(400).json({
        error: 'Please complete the security check and try again.',
        code: 'SECURITY_CHECK_FAILED'
      });
    }

    // 4. Normalize URL and SSRF assertPublicHost check
    let normalizedWebsite;
    let domain;
    try {
      normalizedWebsite = normalizeUrl(parsed.data.website);
      const u = new URL(normalizedWebsite);
      await assertPublicHost(u.hostname);
      domain = u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (urlErr) {
      return res.status(400).json({
        error: urlErr.message || 'Please enter a valid website address.',
        code: urlErr.code || 'INVALID_URL'
      });
    }

    // 5. Caching check (§7.2): Look for a complete non-partial 'done' audit for the same domain within 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cachedAudit = await Audit.findOne({
      domain,
      status: 'done',
      'result.partial': { $ne: true },
      createdAt: { $gte: twentyFourHoursAgo }
    }).sort({ createdAt: -1 });

    if (cachedAudit) {
      // Create new Lead and a new Audit document copying the old result
      const lead = await Lead.create({
        companyName,
        website: normalizedWebsite,
        productsServices,
        industry,
        location,
        email,
        consent
      });

      const newAudit = await Audit.create({
        leadId: lead._id,
        domain,
        status: 'done',
        progress: 100,
        stage: 'Done',
        result: cachedAudit.result,
        finishedAt: new Date()
      });

      lead.auditId = newAudit._id;
      await lead.save();

      // Send audit report email with PDF attached asynchronously
      sendAuditReportEmail(newAudit, lead).catch((mailErr) => {
        console.error(`Failed to send cached report email for audit ${newAudit._id}:`, mailErr.message);
      });

      return res.status(200).json({
        auditId: newAudit._id.toString(),
        status: 'done',
        cached: true
      });
    }

    // 6. Normal flow: Create Lead and queued Audit
    const lead = await Lead.create({
      companyName,
      website: normalizedWebsite,
      productsServices,
      industry,
      location,
      email,
      consent
    });

    const audit = await Audit.create({
      leadId: lead._id,
      domain,
      status: 'queued',
      progress: 0,
      stage: 'Queued'
    });

    lead.auditId = audit._id;
    await lead.save();

    // Start background job without awaiting
    queueAudit(audit._id);

    return res.status(202).json({
      auditId: audit._id.toString(),
      status: 'queued'
    });
  } catch (err) {
    console.error('Error in POST /api/audits:', err);
    return next(err);
  }
});

/**
 * GET /api/audits/:id
 * Retrieve audit progress or result. Never returns email.
 */
router.get('/audits/:id', getAuditLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Audit not found.',
        code: 'NOT_FOUND'
      });
    }

    const audit = await Audit.findById(id);
    if (!audit) {
      return res.status(404).json({
        error: 'Audit not found.',
        code: 'NOT_FOUND'
      });
    }

    const lead = await Lead.findById(audit.leadId);

    const responsePayload = {
      id: audit._id.toString(),
      status: audit.status,
      progress: audit.progress,
      stage: audit.stage,
      companyName: lead ? lead.companyName : '',
      website: lead ? lead.website : ''
    };

    if (audit.status === 'done' && audit.result) {
      responsePayload.result = audit.result;
    }

    if (audit.error) {
      responsePayload.error = audit.error;
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error(`Error in GET /api/audits/${req.params.id}:`, err);
    return next(err);
  }
});

/**
 * GET /api/audits/:id/pdf
 * Generate and download PDF report when audit status is 'done'.
 * Returns 409 if audit is not done yet.
 */
router.get('/audits/:id/pdf', getAuditLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Audit not found.',
        code: 'NOT_FOUND'
      });
    }

    const audit = await Audit.findById(id);
    if (!audit || audit.status !== 'done') {
      return res.status(409).json({
        error: 'The report is not ready yet.',
        code: 'NOT_READY'
      });
    }

    const lead = await Lead.findById(audit.leadId);
    const pdfBuffer = await generatePdf(audit, lead);

    const slug = getCompanySlug(lead?.companyName || audit.domain);
    const filename = `${slug}-ai-readiness-report.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(`Error generating PDF for audit ${req.params.id}:`, err);
    return next(err);
  }
});

module.exports = router;
