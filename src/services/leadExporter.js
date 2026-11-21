const ExcelJS = require('exceljs');
const Lead = require('../models/Lead');

/**
 * Sanitize text to prevent CSV/Excel Formula Injection (CWE-1236).
 * Prepends a single quote if string starts with formula operators (=, +, -, @).
 */
function sanitizeExcelCell(val) {
  if (typeof val === 'string' && /^[=+@\-]/.test(val)) {
    return `'${val}`;
  }
  return val;
}

/**
 * Format a Date object or ISO string to 'YYYY-MM-DD HH:mm:ss' in UTC/local.
 */
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Visual styling colors for audit grades.
 */
const GRADE_STYLES = {
  Strong: { fill: 'D1E7DD', font: '0F5132' },
  Good: { fill: 'CFE2FF', font: '084298' },
  Basic: { fill: 'FFE5D0', font: '984C0C' },
  'Not Ready': { fill: 'F8D7DA', font: '842029' }
};

/**
 * Query MongoDB and generate a styled Microsoft Excel (.xlsx) buffer containing
 * the complete customer database with their associated audit outcomes.
 *
 * @param {Array} [inMemoryLeads] Optional leads array for testing or offline exports
 * @returns {Promise<{buffer: Buffer, filename: string, totalCount: number, newThisWeek: number, avgScore: number|null}>}
 */
async function exportLeadsToExcelBuffer(inMemoryLeads = null) {
  let leads = inMemoryLeads;

  if (!leads) {
    leads = await Lead.find({})
      .populate('auditId')
      .sort({ createdAt: -1 })
      .lean();
  }

  const totalCount = leads.length;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let newThisWeek = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  for (const lead of leads) {
    if (lead.createdAt && new Date(lead.createdAt) >= oneWeekAgo) {
      newThisWeek++;
    }
    const score = lead.auditId?.result?.overallScore;
    if (typeof score === 'number') {
      scoreSum += score;
      scoredCount++;
    }
  }

  const avgScore = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : null;

  // Build the Excel workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fospertise AI Readiness Audit Tool';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Customer Leads & Audits', {
    views: [{ state: 'frozen', ySplit: 1 }] // Freeze header row
  });

  // Define columns
  sheet.columns = [
    { header: 'Submission Date', key: 'createdAt', width: 22 },
    { header: 'Company Name', key: 'companyName', width: 26 },
    { header: 'Website URL', key: 'website', width: 34 },
    { header: 'Email Address', key: 'email', width: 30 },
    { header: 'Industry', key: 'industry', width: 22 },
    { header: 'Location', key: 'location', width: 22 },
    { header: 'Products & Services', key: 'productsServices', width: 38 },
    { header: 'Audit Status', key: 'auditStatus', width: 14 },
    { header: 'Overall Score', key: 'overallScore', width: 15 },
    { header: 'Grade', key: 'grade', width: 14 },
    { header: 'Report Emailed?', key: 'emailSent', width: 16 }
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Deep Navy Blue
    };
    cell.font = {
      name: 'Segoe UI',
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: false
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // Populate data rows
  leads.forEach((lead, index) => {
    const audit = lead.auditId || {};
    const result = audit.result || {};
    const scoreVal = typeof result.overallScore === 'number' ? `${result.overallScore} / 100` : 'N/A';
    const gradeVal = result.grade || (audit.status === 'done' ? 'Completed' : audit.status || 'Pending');
    const emailSentVal = lead.emailSent ? 'Yes' : 'No';

    const row = sheet.addRow({
      createdAt: formatDate(lead.createdAt),
      companyName: sanitizeExcelCell(lead.companyName || ''),
      website: lead.website || '',
      email: lead.email || '',
      industry: sanitizeExcelCell(lead.industry || ''),
      location: sanitizeExcelCell(lead.location || ''),
      productsServices: sanitizeExcelCell(lead.productsServices || ''),
      auditStatus: audit.status || 'queued',
      overallScore: scoreVal,
      grade: gradeVal,
      emailSent: emailSentVal
    });

    row.height = 20;

    // Apply borders and styling
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Zebra striping for readability
      if (index % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }

      // Highlight Grade cell if known grade
      if (colNumber === 10 && GRADE_STYLES[gradeVal]) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${GRADE_STYLES[gradeVal].fill}` }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 10,
          bold: true,
          color: { argb: `FF${GRADE_STYLES[gradeVal].font}` }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Center-align score and email sent status
      if (colNumber === 9 || colNumber === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `fospertise-customer-leads-${dateStr}.xlsx`;

  return {
    buffer: Buffer.from(buffer),
    filename,
    totalCount,
    newThisWeek,
    avgScore
  };
}

module.exports = {
  exportLeadsToExcelBuffer,
  formatDate,
  sanitizeExcelCell
};
