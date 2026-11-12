const pLimit = require('p-limit').default || require('p-limit');
const config = require('../config');
const Audit = require('../models/Audit');
const Lead = require('../models/Lead');
const { safeFetch } = require('../services/safeFetch');
const { crawlSite } = require('../services/crawler');
const { runTechnicalChecks } = require('../services/checks/technical');
const { getPageSpeed } = require('../services/pagespeed');
const { checkSchema } = require('../services/checks/schema');
const { checkStructure } = require('../services/checks/structure');
const { checkTrust } = require('../services/checks/trust');
const { judgeContent, buildQuestionCoverage } = require('../services/gemini');
const { calculateScore } = require('../services/scoring');
const { sendAuditReportEmail } = require('../services/email');

const AUDIT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const auditQueue = pLimit(2); // Global concurrency limit: 2 audits at a time

/**
 * Update the audit progress and stage in MongoDB.
 */
async function updateStage(auditId, progress, stage) {
  try {
    await Audit.findByIdAndUpdate(auditId, {
      status: 'running',
      progress,
      stage
    });
  } catch (err) {
    console.error(`Failed to update stage for audit ${auditId}:`, err.message);
  }
}

/**
 * Run the audit pipeline directly without HTTP.
 * Can be used by background jobs, CLI scripts, and tests.
 *
 * @param {object} params
 * @param {string} params.website - Normalized target website URL
 * @param {string} params.companyName - Company name
 * @param {string} [params.productsServices] - Core offerings
 * @param {string} [params.industry] - Industry category
 * @param {string} [params.location] - Location
 * @param {function} [params.onProgress] - Callback (progress: number, stage: string) => Promise<void> | void
 * @returns {Promise<object>} Final result object matching SPEC §7.3
 */
async function runAuditPipeline({
  website,
  companyName,
  productsServices = '',
  industry = '',
  location = '',
  onProgress = () => {}
}) {
  const warnings = [];

  // Stage: 5 - Checking website
  await onProgress(5, 'Checking website');
  try {
    const homeRes = await safeFetch(website, { timeout: 10000 });
    if (homeRes.status >= 400) {
      throw new Error('Website returned HTTP ' + homeRes.status);
    }
  } catch (err) {
    const e = new Error('We could not open this website. Please check the address.');
    e.userMessage = true;
    throw e;
  }

  // Stage: 20 - Crawling pages
  await onProgress(20, 'Crawling pages');
  let pages = [];
  try {
    const crawlResult = await crawlSite(website, { maxPages: config.MAX_PAGES });
    pages = crawlResult.pages || [];
    if (crawlResult.errors && crawlResult.errors.length > 0) {
      warnings.push(`Some pages failed to crawl: ${crawlResult.errors.length} error(s).`);
    }
  } catch (err) {
    warnings.push(`Crawler encountered an issue: ${err.message}`);
  }

  if (pages.length === 0) {
    const e = new Error('We could not open this website. Please check the address.');
    e.userMessage = true;
    throw e;
  }

  // Stage: 40 - Technical checks
  await onProgress(40, 'Technical checks');
  let technical = null;
  try {
    technical = await runTechnicalChecks(website, pages);
  } catch (err) {
    warnings.push('Technical checks failed to complete.');
    technical = {
      robots: { exists: false, bots: {}, sitemapsDeclared: [] },
      sitemap: { exists: false, urlCount: 0, url: null, urls: [] },
      https: {
        isHttps: website.startsWith('https://'),
        httpRedirectsToHttps: false,
        homepageStatus: 200,
        redirectChainLength: 0
      },
      jsGap: {
        rawLength: pages[0]?.mainText?.length || 0,
        renderedLength: pages[0]?.mainText?.length || 0,
        ratio: 1
      }
    };
  }

  // Stage: 55 - Speed test
  await onProgress(55, 'Speed test');
  let pageSpeed = null;
  try {
    pageSpeed = await getPageSpeed(website);
  } catch (err) {
    pageSpeed = { error: err.message };
  }

  // Stage: 65 - Structure and trust checks
  await onProgress(65, 'Structure and trust checks');
  let schemaResult = null;
  let structureResult = null;
  let trustResult = null;

  try {
    schemaResult = checkSchema(pages);
  } catch (err) {
    warnings.push('Schema check encountered an issue.');
    schemaResult = {};
  }

  try {
    structureResult = checkStructure(pages);
  } catch (err) {
    warnings.push('Structure check encountered an issue.');
    structureResult = {};
  }

  try {
    trustResult = checkTrust(pages);
  } catch (err) {
    warnings.push('Trust check encountered an issue.');
    trustResult = {};
  }

  // Stage: 80 - AI content review (parallel Gemini calls)
  await onProgress(80, 'AI content review');
  let contentResult = null;
  let questionsResult = null;

  try {
    const [cRes, qRes] = await Promise.all([
      judgeContent({
        companyName,
        productsServices,
        industry,
        location,
        pages
      }).catch((err) => ({ error: err.message })),
      // Stagger slightly (600ms) to avoid simultaneous network contention on Gemini API
      new Promise((resolve) => setTimeout(resolve, 600)).then(() =>
        buildQuestionCoverage({
          companyName,
          productsServices,
          industry,
          location,
          pages
        }).catch((err) => ({ error: err.message }))
      )
    ]);

    contentResult = cRes;
    questionsResult = qRes;
  } catch (err) {
    contentResult = { error: err.message };
    questionsResult = { error: err.message };
  }

  // Stage: 90 - Scoring
  await onProgress(90, 'Scoring');
  const scoring = calculateScore({
    technical: technical || {},
    pageSpeed,
    schema: schemaResult || {},
    structure: structureResult || {},
    trust: trustResult || {},
    content: contentResult,
    questions: questionsResult
  });

  const allWarnings = [...warnings, ...(scoring.warnings || [])];

  // Final Result matching SPEC §7.3
  const finalResult = {
    overallScore: scoring.overallScore,
    grade: scoring.grade,
    partial: scoring.partial,
    categories: scoring.categories,
    issues: scoring.issues,
    questions: Array.isArray(questionsResult) ? questionsResult : [],
    pageSpeed:
      pageSpeed && !pageSpeed.error
        ? {
            performance: pageSpeed.performance,
            seo: pageSpeed.seo,
            accessibility: pageSpeed.accessibility,
            bestPractices: pageSpeed.bestPractices,
            metrics: pageSpeed.metrics,
            opportunities: pageSpeed.opportunities
          }
        : pageSpeed?.error
          ? { error: pageSpeed.error }
          : null,
    pagesCrawled: pages.map((p) => p.url),
    warnings: allWarnings
  };

  return finalResult;
}

/**
 * Execute the audit pipeline for an Audit record in MongoDB.
 */
async function executeAudit(auditId) {
  let isTimedOut = false;
  let timeoutId = null;

  try {
    const audit = await Audit.findById(auditId);
    if (!audit || audit.status === 'done' || audit.status === 'failed') {
      return;
    }

    const lead = await Lead.findById(audit.leadId);
    if (!lead) {
      await Audit.findByIdAndUpdate(auditId, {
        status: 'failed',
        error: 'Lead record not found.',
        finishedAt: new Date()
      });
      return;
    }

    // 3-minute overall timeout timer
    timeoutId = setTimeout(async () => {
      isTimedOut = true;
      try {
        const current = await Audit.findById(auditId);
        if (current && current.status !== 'done' && current.status !== 'failed') {
          await Audit.findByIdAndUpdate(auditId, {
            status: 'failed',
            error: 'The audit took too long. Please try again.',
            finishedAt: new Date()
          });
        }
      } catch (_) {}
    }, AUDIT_TIMEOUT_MS);

    const finalResult = await runAuditPipeline({
      website: lead.website,
      companyName: lead.companyName,
      productsServices: lead.productsServices,
      industry: lead.industry,
      location: lead.location,
      onProgress: async (pct, stage) => {
        if (!isTimedOut) await updateStage(auditId, pct, stage);
      }
    });

    clearTimeout(timeoutId);
    if (isTimedOut) return;

    // Stage: 100 - Done
    await Audit.findByIdAndUpdate(auditId, {
      status: 'done',
      progress: 100,
      stage: 'Done',
      result: finalResult,
      error: null,
      finishedAt: new Date()
    });

    // Send audit report email with PDF attached (non-blocking)
    sendAuditReportEmail(
      { _id: auditId, domain: audit.domain, result: finalResult },
      lead
    ).catch((mailErr) => {
      console.error(`Failed to send report email for audit ${auditId}:`, mailErr.message);
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (!isTimedOut) {
      console.error(`Audit pipeline unexpected error for ${auditId}:`, err);
      const userMessage = err.userMessage ? err.message : 'Something went wrong. Please try again.';
      await Audit.findByIdAndUpdate(auditId, {
        status: 'failed',
        error: userMessage,
        finishedAt: new Date()
      }).catch((dbErr) => {
        console.error(`Failed to update status to failed for ${auditId}:`, dbErr.message);
      });
    }
  }
}

/**
 * Queue an audit execution within the global concurrency limit (2).
 */
function queueAudit(auditId) {
  auditQueue(() => executeAudit(auditId)).catch((err) => {
    console.error(`Error in audit queue execution for ${auditId}:`, err);
  });
}

module.exports = {
  queueAudit,
  executeAudit,
  runAuditPipeline
};
