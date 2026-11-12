const nodemailer = require('nodemailer');
const config = require('../config');
const Lead = require('../models/Lead');
const { generatePdf, getCompanySlug, generateSummaryText } = require('./report');

let cachedTransporter = null;

/**
 * HTML escape helper to prevent HTML injection in emails.
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
 * Returns a nodemailer transporter instance configured with environment variables.
 */
function getTransporter() {
  if (!config.SMTP_USER || !config.SMTP_PASS) {
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.SMTP_HOST || 'smtp.gmail.com',
      port: Number(config.SMTP_PORT) || 465,
      secure: config.SMTP_SECURE === true || Number(config.SMTP_PORT) === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS
      }
    });
  }

  return cachedTransporter;
}

/**
 * Visual styles for audit grades matching SPEC §15.
 */
const GRADE_COLORS = {
  Strong: { bg: '#d1e7dd', text: '#0f5132', border: '#a3cfbb', color: '#198754' },
  Good: { bg: '#cfe2ff', text: '#084298', border: '#9ec5fe', color: '#0d6efd' },
  Basic: { bg: '#ffe5d0', text: '#984c0c', border: '#ffc69b', color: '#fd7e14' },
  'Not Ready': { bg: '#f8d7da', text: '#842029', border: '#f1aeb5', color: '#dc3545' }
};

/**
 * Generate a responsive, professional HTML email body for the audit report.
 */
function buildEmailHtml(audit, lead) {
  const result = audit.result || {};
  const score = Math.max(0, Math.min(100, Math.round(Number(result.overallScore) || 0)));
  const grade = result.grade || 'Good';
  const gradeStyle = GRADE_COLORS[grade] || GRADE_COLORS.Good;
  const brandName = config.REPORT_BRAND_NAME || 'Fospertise';
  const brandUrl = config.REPORT_BRAND_URL || 'https://fospertise.com';
  const brandEmail = config.REPORT_BRAND_EMAIL || 'info@fospertise.com';

  const summary = generateSummaryText(score, grade, result.categories);
  const categories = Array.isArray(result.categories) ? result.categories : [];

  const categoryRows = categories
    .map((cat) => {
      const catScore = Number(cat.score) || 0;
      const catMax = Number(cat.max) || 0;
      const pct = catMax > 0 ? Math.min(100, Math.round((catScore / catMax) * 100)) : 0;
      const barColor = pct >= 80 ? '#198754' : pct >= 50 ? '#0d6efd' : pct >= 30 ? '#fd7e14' : '#dc3545';
      return `
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #334155; font-weight: 500;">
            ${escapeHtml(cat.label || cat.key)}
          </td>
          <td style="padding: 8px 0; text-align: right; font-size: 13px; color: #0f172a; font-weight: 600;">
            ${catScore} / ${catMax} pts (${pct}%)
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-bottom: 10px;">
            <div style="background-color: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background-color: ${barColor}; height: 100%; width: ${pct}%; border-radius: 4px;"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AI Readiness Audit Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: #0f172a; color: #ffffff; text-align: left;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #60a5fa; margin-bottom: 4px;">
                ${escapeHtml(brandName)} • AI READINESS CHECKER
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">
                Your AI Readiness Audit Report
              </h1>
            </td>
          </tr>

          <!-- Intro & Meta -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; color: #334155;">
              <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6;">
                Hello <strong>${escapeHtml(lead.companyName)}</strong> team,
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.6;">
                We have completed the AI Readiness Audit for your website: <a href="${escapeHtml(lead.website)}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${escapeHtml(lead.website)}</a>. A complete copy of your PDF report is attached to this email.
              </p>
            </td>
          </tr>

          <!-- Score Card Box -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; margin-bottom: 8px;">
                  Overall AI Readiness Score
                </div>
                <div style="font-size: 44px; font-weight: 800; color: #0f172a; line-height: 1;">
                  ${score}<span style="font-size: 20px; font-weight: 600; color: #64748b;"> / 100</span>
                </div>
                <div style="margin-top: 10px;">
                  <span style="display: inline-block; padding: 5px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; background-color: ${gradeStyle.bg}; color: ${gradeStyle.text}; border: 1px solid ${gradeStyle.border};">
                    ${escapeHtml(grade)}
                  </span>
                </div>
                <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 1.6; color: #475569; text-align: left; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                  ${escapeHtml(summary)}
                </p>
              </div>
            </td>
          </tr>

          <!-- Category Breakdown -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
                Score Breakdown by Area
              </h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${categoryRows}
              </table>
            </td>
          </tr>

          <!-- PDF Attached Notice -->
          <tr>
            <td style="padding: 24px 32px; text-align: center;">
              <div style="background-color: #eff6ff; border: 1px dashed #93c5fd; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 14px; margin-bottom: 4px;">
                  📎 Full Comprehensive Audit Report Attached (PDF)
                </div>
                <div style="font-size: 12px; color: #3b82f6; line-height: 1.5;">
                  Your downloadable PDF includes deep schema diagnostics, question coverage simulation, Google PageSpeed CWV benchmarks, and actionable fixes.
                </div>
              </div>
              <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong>Honesty &amp; Methodology Notice:</strong> This score shows how ready your website is. It cannot promise a place in Google AI Overviews or any AI answer.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0f172a; color: #94a3b8; font-size: 12px; line-height: 1.6; text-align: center;">
              <div>Need assistance implementing these AI search optimizations?</div>
              <div style="margin-top: 4px;">
                Contact <a href="${escapeHtml(brandUrl)}" style="color: #60a5fa; text-decoration: none;">${escapeHtml(brandName)}</a> at
                <a href="mailto:${escapeHtml(brandEmail)}" style="color: #60a5fa; text-decoration: none;">${escapeHtml(brandEmail)}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send the audit report email with PDF attachment.
 * Non-blocking and catches errors so failures never disrupt the main pipeline.
 *
 * @param {object} audit The Audit document or result object
 * @param {object} lead The Lead document or object with email and companyName
 * @param {Buffer} [pdfBuffer] Optional pre-generated PDF buffer
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendAuditReportEmail(audit, lead, pdfBuffer = null) {
  if (!lead || !lead.email) {
    return { success: false, error: 'No recipient email specified.' };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.log('[EmailService] SMTP credentials not configured; skipping email dispatch.');
    return { success: false, error: 'SMTP credentials not configured.' };
  }

  try {
    // Generate PDF if not already provided
    let buffer = pdfBuffer;
    if (!buffer) {
      buffer = await generatePdf(audit, lead);
    }

    const companySlug = getCompanySlug(lead.companyName);
    const filename = `${companySlug}-ai-readiness-report.pdf`;
    const score = audit.result?.overallScore || 0;
    const grade = audit.result?.grade || 'Report';

    const mailOptions = {
      from: config.EMAIL_FROM || `Fospertise <${config.SMTP_USER}>`,
      to: lead.email,
      subject: `Your AI Readiness Audit Report – ${lead.companyName} (${score}/100, ${grade})`,
      html: buildEmailHtml(audit, lead),
      text: `Hello ${lead.companyName},\n\nYour AI Readiness Audit Report is complete!\nOverall Score: ${score}/100 (${grade})\nWebsite: ${lead.website}\n\nPlease find your comprehensive PDF audit report attached to this email.\n\nBest regards,\n${config.REPORT_BRAND_NAME || 'Fospertise'}\n${config.REPORT_BRAND_URL || 'https://fospertise.com'}`,
      attachments: [
        {
          filename,
          content: buffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Audit report email successfully sent to ${lead.email} (MessageID: ${info.messageId})`);

    // Update lead record if it exists in MongoDB
    if (lead._id) {
      await Lead.findByIdAndUpdate(lead._id, {
        emailSent: true,
        emailSentAt: new Date()
      }).catch(() => {});
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailService] Failed to send audit report email to ${lead.email}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getTransporter,
  sendAuditReportEmail,
  buildEmailHtml
};

