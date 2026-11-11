const pLimit = require('p-limit').default || require('p-limit');
const config = require('../config');
const { getBrowser } = require('./browser');

// Limit concurrent PDF generation to 2 at a time
const pdfQueue = pLimit(2);

/**
 * HTML escape helper to prevent XSS/injection in generated PDF.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Slugify company name for the PDF download filename.
 */
function getCompanySlug(name) {
  if (!name || typeof name !== 'string') return 'audit';
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'audit';
}

/**
 * Grade visual styles and colors matching SPEC §15.
 */
const GRADE_STYLES = {
  Strong: {
    color: '#198754',
    bg: '#d1e7dd',
    border: '#a3cfbb',
    text: '#0f5132'
  },
  Good: {
    color: '#0d6efd',
    bg: '#cfe2ff',
    border: '#9ec5fe',
    text: '#084298'
  },
  Basic: {
    color: '#fd7e14',
    bg: '#ffe5d0',
    border: '#ffc69b',
    text: '#984c0c'
  },
  'Not Ready': {
    color: '#dc3545',
    bg: '#f8d7da',
    border: '#f1aeb5',
    text: '#842029'
  }
};

const SEVERITY_STYLES = {
  high: {
    bg: '#fef2f2',
    color: '#991b1b',
    border: '#f87171',
    label: 'HIGH'
  },
  medium: {
    bg: '#fffbeb',
    color: '#92400e',
    border: '#fcd34d',
    label: 'MEDIUM'
  },
  low: {
    bg: '#f1f5f9',
    color: '#334155',
    border: '#cbd5e1',
    label: 'LOW'
  }
};

/**
 * Generate a 2-3 sentence deterministic summary from the score and category results (no LLM).
 */
function generateSummaryText(score, grade, categories) {
  let opening = '';
  if (score >= 80) {
    opening = `Your website demonstrates strong readiness for AI answer engines with an overall score of ${score}/100 (${grade}).`;
  } else if (score >= 60) {
    opening = `Your website has a solid foundation for AI search visibility with an overall score of ${score}/100 (${grade}).`;
  } else if (score >= 40) {
    opening = `Your website has basic search visibility with an overall score of ${score}/100 (${grade}), but requires key structural improvements to be cited reliably by AI engines.`;
  } else {
    opening = `Your website currently scores ${score}/100 (${grade}) for AI readiness, indicating that significant search and AI indexing opportunities are being missed.`;
  }

  const validCats = (categories || []).filter((c) => typeof c.score === 'number' && c.max > 0);
  let detail = '';

  if (validCats.length > 0) {
    const sorted = [...validCats].sort((a, b) => b.score / b.max - a.score / a.max);
    const best = sorted[0];
    const weakest = sorted[sorted.length - 1];

    if (best && weakest && best.key !== weakest.key) {
      const bestPct = Math.round((best.score / best.max) * 100);
      const weakPct = Math.round((weakest.score / weakest.max) * 100);
      detail = `Performance is highest in ${best.label} (${bestPct}%), while ${weakest.label} (${weakPct}%) represents the most impactful area for immediate optimization.`;
    } else {
      detail = 'Scores across technical crawlability, structured schema, content depth, and trust indicators highlight clear avenues for enhancement.';
    }
  } else {
    detail = 'Several checks could not be fully measured, but available indicators outline key next steps.';
  }

  const closing =
    'Addressing the high-priority recommendations detailed in this report will improve crawl accessibility, citation likelihood, and overall brand credibility.';

  return `${opening} ${detail} ${closing}`;
}

/**
 * Render the full self-contained HTML for the report.
 *
 * @param {object} audit Audit document or object
 * @param {object} lead Lead document or object
 * @returns {string} Self-contained HTML string with inline CSS
 */
function renderReportHtml(audit, lead) {
  const result = audit.result || {};
  const score = Math.max(0, Math.min(100, Math.round(Number(result.overallScore) || 0)));
  const grade = result.grade || 'Not Ready';
  const gradeStyle = GRADE_STYLES[grade] || GRADE_STYLES['Not Ready'];

  const companyName = lead?.companyName || audit.domain || 'Your Company';
  const website = lead?.website || `https://${audit.domain}`;
  const reportDate = new Date(audit.finishedAt || audit.createdAt || Date.now()).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const categories = Array.isArray(result.categories) ? result.categories : [];
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const missingQuestions = questions.filter((q) => !q.answered);
  const pagesCrawled = Array.isArray(result.pagesCrawled) ? result.pagesCrawled : [];
  const pageSpeed = result.pageSpeed && !result.pageSpeed.error ? result.pageSpeed : null;
  const isPartial = Boolean(result.partial);

  const summaryParagraph = generateSummaryText(score, grade, categories);

  // SVG Gauge calculations (radius 54, circumference ~339.292)
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - score / 100);

  // Brand config
  const brandName = config.REPORT_BRAND_NAME || 'Fospertise';
  const brandUrl = config.REPORT_BRAND_URL || 'https://fospertise.com';
  const brandEmail = config.REPORT_BRAND_EMAIL || 'info@fospertise.com';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AI Readiness Report - ${escapeHtml(companyName)}</title>
  <style>
    @page {
      size: A4;
      margin: 14mm 16mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      page-break-after: always;
      break-after: page;
    }
    .page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Typography & Utilities */
    h1, h2, h3, h4, p {
      margin: 0;
    }
    .text-muted { color: #64748b; }
    .text-primary { color: #2563eb; }
    .fw-bold { font-weight: 700; }
    .fw-semibold { font-weight: 600; }
    .small { font-size: 11px; }

    /* Cover Page */
    .cover-container {
      min-height: 860px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 30px 10px;
    }
    .cover-header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
    }
    .brand-eyebrow {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #2563eb;
      margin-bottom: 6px;
    }
    .cover-title {
      font-size: 32px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .cover-hero {
      text-align: center;
      padding: 50px 0;
    }
    .cover-company {
      font-size: 30px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .cover-website {
      font-size: 15px;
      color: #2563eb;
      word-break: break-all;
      margin-bottom: 40px;
    }
    .gauge-wrapper {
      display: inline-block;
      margin-bottom: 16px;
    }
    .badge-grade {
      display: inline-block;
      padding: 6px 20px;
      font-size: 15px;
      font-weight: 700;
      border-radius: 9999px;
      background-color: ${gradeStyle.bg};
      color: ${gradeStyle.text};
      border: 1px solid ${gradeStyle.border};
      margin-top: 6px;
    }
    .partial-banner {
      margin-top: 24px;
      padding: 10px 18px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
      color: #475569;
      display: inline-block;
    }
    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #64748b;
    }

    /* Section Headers */
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .section-sub {
      font-size: 12px;
      font-weight: 400;
      color: #64748b;
    }
    .content-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
    }

    /* Category Progress Bars */
    .cat-item {
      margin-bottom: 16px;
    }
    .cat-head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .cat-bar-bg {
      height: 10px;
      background: #e2e8f0;
      border-radius: 5px;
      overflow: hidden;
    }
    .cat-bar-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 5px;
    }

    /* Issues Table */
    .issues-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 12px;
    }
    .issues-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 9px 12px;
      border-bottom: 1px solid #cbd5e1;
    }
    .issues-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* Questions List */
    .question-list {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    .question-item {
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #f59e0b;
      border-radius: 4px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    /* Speed Box */
    .speed-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }
    .speed-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .speed-val {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
    }
    .speed-metric-row {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      margin-top: 10px;
      font-size: 11px;
    }

    /* Pages List */
    .pages-box {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: #475569;
      line-height: 1.5;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .page-url-item {
      padding: 1.5px 0;
      word-break: break-all;
      overflow-wrap: anywhere;
    }

    /* Last Page / CTA */
    .cta-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      border-radius: 8px;
      padding: 24px;
      margin-top: 24px;
    }
    .cta-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #ffffff;
    }
    .cta-text {
      color: #cbd5e1;
      font-size: 13px;
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .cta-contacts {
      display: flex;
      gap: 24px;
      font-size: 12px;
    }
    .cta-link {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>

  <!-- ==================== 1. COVER PAGE ==================== -->
  <div class="page">
    <div class="cover-container">
      <div class="cover-header">
        <div class="brand-eyebrow">${escapeHtml(brandName)} Audit Services</div>
        <div class="cover-title">AI Readiness Report</div>
      </div>

      <div class="cover-hero">
        <div class="cover-company">${escapeHtml(companyName)}</div>
        <div class="cover-website">${escapeHtml(website)}</div>

        <div class="gauge-wrapper">
          <svg width="150" height="150" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="12" />
            <circle cx="75" cy="75" r="${radius}" fill="none" stroke="${gradeStyle.color}" stroke-width="12"
                    stroke-dasharray="${circumference.toFixed(1)}"
                    stroke-dashoffset="${strokeDashoffset.toFixed(1)}"
                    stroke-linecap="round"
                    transform="rotate(-90 75 75)" />
            <text x="75" y="72" text-anchor="middle" font-size="34" font-weight="700" fill="#0f172a">${score}</text>
            <text x="75" y="93" text-anchor="middle" font-size="11" font-weight="600" fill="#64748b">OUT OF 100</text>
          </svg>
        </div>

        <div>
          <span class="badge-grade">${escapeHtml(grade)}</span>
        </div>

        ${
          isPartial
            ? `<div class="partial-banner">Note: Some checks could not be measured, so this score is calculated from available data.</div>`
            : ''
        }
      </div>

      <div class="cover-footer">
        <div>Date of Audit: <strong>${escapeHtml(reportDate)}</strong></div>
        <div>Evaluation standard: SPEC AI Readiness Formula v1.0</div>
      </div>
    </div>
  </div>

  <!-- ==================== 2. SUMMARY & CATEGORIES ==================== -->
  <div class="page">
    <div class="section-title">
      <span>Executive Summary</span>
      <span class="section-sub">${escapeHtml(companyName)}</span>
    </div>

    <div class="content-box">
      <p style="font-size: 13px; line-height: 1.6; color: #334155;">${escapeHtml(summaryParagraph)}</p>
    </div>

    <div class="section-title" style="margin-top: 30px;">
      <span>Readiness Score by Area</span>
      <span class="section-sub">Four Pillars of AI Visibility</span>
    </div>

    <div style="margin-bottom: 30px;">
      ${categories
        .map((cat) => {
          const max = Number(cat.max) || 0;
          const sc = Number(cat.score) || 0;
          const pct = max > 0 ? Math.min(100, Math.round((sc / max) * 100)) : 0;
          const barColor = pct >= 80 ? '#198754' : pct >= 50 ? '#2563eb' : pct >= 30 ? '#fd7e14' : '#dc3545';
          return `
          <div class="cat-item avoid-break">
            <div class="cat-head">
              <span class="fw-semibold">${escapeHtml(cat.label || cat.key)}</span>
              <span class="text-muted fw-semibold">${sc} / ${max} pts (${pct}%)</span>
            </div>
            <div class="cat-bar-bg">
              <div class="cat-bar-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
            </div>
          </div>
        `;
        })
        .join('')}
    </div>

    <!-- ==================== 5. SPEED & QUALITY (if available) ==================== -->
    ${
      pageSpeed
        ? `
      <div class="avoid-break" style="margin-top: 24px;">
        <div class="section-title">
          <span>Speed &amp; Technical Quality (Mobile)</span>
          <span class="section-sub">Google PageSpeed Insights</span>
        </div>
        <div class="content-box" style="margin-bottom: 0;">
          <div class="speed-grid">
            <div class="speed-card">
              <div class="small text-muted mb-1">Performance</div>
              <div class="speed-val" style="color: ${pageSpeed.performance >= 90 ? '#198754' : pageSpeed.performance >= 50 ? '#fd7e14' : '#dc3545'}">${pageSpeed.performance ?? '-'}</div>
            </div>
            <div class="speed-card">
              <div class="small text-muted mb-1">SEO</div>
              <div class="speed-val" style="color: ${pageSpeed.seo >= 90 ? '#198754' : pageSpeed.seo >= 50 ? '#fd7e14' : '#dc3545'}">${pageSpeed.seo ?? '-'}</div>
            </div>
            <div class="speed-card">
              <div class="small text-muted mb-1">Accessibility</div>
              <div class="speed-val" style="color: ${pageSpeed.accessibility >= 90 ? '#198754' : pageSpeed.accessibility >= 50 ? '#fd7e14' : '#dc3545'}">${pageSpeed.accessibility ?? '-'}</div>
            </div>
            <div class="speed-card">
              <div class="small text-muted mb-1">Best Practices</div>
              <div class="speed-val" style="color: ${pageSpeed.bestPractices >= 90 ? '#198754' : pageSpeed.bestPractices >= 50 ? '#fd7e14' : '#dc3545'}">${pageSpeed.bestPractices ?? '-'}</div>
            </div>
          </div>
          ${
            pageSpeed.metrics
              ? `
            <div class="speed-metric-row text-muted">
              <span>LCP: <strong>${escapeHtml(pageSpeed.metrics.lcp || 'N/A')}</strong></span>
              <span>CLS: <strong>${escapeHtml(pageSpeed.metrics.cls || 'N/A')}</strong></span>
              <span>TBT: <strong>${escapeHtml(pageSpeed.metrics.tbt || 'N/A')}</strong></span>
              <span>FCP: <strong>${escapeHtml(pageSpeed.metrics.fcp || 'N/A')}</strong></span>
            </div>
          `
              : ''
          }
        </div>
      </div>
    `
        : ''
    }
  </div>

  <!-- ==================== 3. TOP ISSUES & ACTION PLAN ==================== -->
  <div class="page">
    <div class="section-title">
      <span>Top Issues to Fix</span>
      <span class="section-sub">Prioritized by Impact</span>
    </div>

    ${
      issues.length === 0
        ? `<div class="content-box"><p class="text-muted">No high-priority issues were detected on the audited pages.</p></div>`
        : `
      <table class="issues-table">
        <thead>
          <tr>
            <th style="width: 85px;">Severity</th>
            <th style="width: 200px;">Problem</th>
            <th>Why It Matters</th>
            <th>How to Fix It</th>
          </tr>
        </thead>
        <tbody>
          ${issues
            .map((issue) => {
              const sev = String(issue.severity || 'low').toLowerCase();
              const style = SEVERITY_STYLES[sev] || SEVERITY_STYLES.low;
              return `
              <tr>
                <td>
                  <span class="pill" style="background:${style.bg}; color:${style.color}; border:1px solid ${style.border};">
                    ${style.label}
                  </span>
                </td>
                <td>
                  <div class="fw-semibold" style="color: #0f172a;">${escapeHtml(issue.title)}</div>
                  ${issue.page ? `<div class="small text-muted" style="margin-top: 4px; word-break: break-all;">${escapeHtml(issue.page)}</div>` : ''}
                </td>
                <td style="color: #475569;">${escapeHtml(issue.why)}</td>
                <td style="color: #0f172a; font-weight: 500;">${escapeHtml(issue.fix)}</td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    `
    }

    <!-- ==================== 4. MISSING QUESTIONS ==================== -->
    <div class="avoid-break" style="margin-top: 30px;">
      <div class="section-title">
        <span>Missing Customer Questions</span>
        <span class="section-sub">Queries Potential Clients Ask AI Assistants</span>
      </div>

      ${
        missingQuestions.length === 0
          ? `
        <div class="content-box">
          <p style="color: #15803d; font-weight: 500;">All simulated customer questions were answered by your site content.</p>
        </div>
      `
          : `
        <div class="content-box" style="margin-bottom: 12px; padding: 10px 16px;">
          <p class="small text-muted">The following ${missingQuestions.length} realistic customer queries were not clearly answered across your crawled pages:</p>
        </div>
        <ul class="question-list">
          ${missingQuestions
            .map(
              (q) => `
            <li class="question-item">
              <strong>Question:</strong> ${escapeHtml(q.question)}
            </li>
          `
            )
            .join('')}
        </ul>
      `
      }
    </div>
  </div>

  <!-- ==================== 6. PAGES CHECKED & 7. WHAT THIS MEANS ==================== -->
  <div class="page">
    <div class="section-title">
      <span>Pages Audited</span>
      <span class="section-sub">${pagesCrawled.length} URL(s) inspected</span>
    </div>

    <div class="content-box avoid-break" style="margin-bottom: 24px;">
      <div class="pages-box">
        ${pagesCrawled.map((url) => `<div class="page-url-item">• ${escapeHtml(url)}</div>`).join('')}
      </div>
    </div>

    <div class="section-title">
      <span>What This Score Means</span>
      <span class="section-sub">Honesty &amp; Methodology Notice</span>
    </div>

    <div class="content-box" style="border-left: 4px solid #2563eb;">
      <p style="font-weight: 600; color: #0f172a; margin-bottom: 8px;">
        This score shows how ready your website is. It cannot promise a place in Google AI Overviews or any AI answer.
      </p>
      <p style="color: #475569; font-size: 12px; line-height: 1.6;">
        AI search engines and generative models (such as Google AI Overviews, ChatGPT Search, Perplexity, and Gemini) rely on structured schema, clear direct answers, robust technical crawl access, and credible trust signals to identify authoritative sources. While ranking algorithms are dynamic and opaque, fulfilling the criteria measured in this report maximizes your content's machine readability and quotation likelihood.
      </p>
    </div>

    <!-- Call to Action -->
    <div class="cta-card avoid-break">
      <div class="cta-title">Ready to improve your AI visibility?</div>
      <div class="cta-text">
        The team at <strong>${escapeHtml(brandName)}</strong> specializes in engineering web architectures, structured schema integration, and technical content optimization to elevate your visibility across modern search and AI ecosystems.
      </div>
      <div class="cta-contacts">
        <div>Web: <a class="cta-link" href="${escapeHtml(brandUrl)}" target="_blank" rel="noopener">${escapeHtml(brandUrl)}</a></div>
        <div>Email: <a class="cta-link" href="mailto:${escapeHtml(brandEmail)}">${escapeHtml(brandEmail)}</a></div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Generate a PDF buffer from an Audit and Lead record.
 * Concurrency limited to 2 at a time via pdfQueue.
 *
 * @param {object} audit
 * @param {object} lead
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generatePdf(audit, lead) {
  return pdfQueue(async () => {
    const html = renderReportHtml(audit, lead);
    const browser = await getBrowser();
    const context = await browser.newContext();

    try {
      const page = await context.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '12mm',
            right: '12mm',
            bottom: '12mm',
            left: '12mm'
          }
        });
        return pdfBuffer;
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      await context.close().catch(() => {});
    }
  });
}

module.exports = {
  renderReportHtml,
  generatePdf,
  getCompanySlug,
  generateSummaryText
};
