const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { exportLeadsToExcelBuffer, formatDate } = require('../src/services/leadExporter');
const { buildWeeklyExportEmailHtml } = require('../src/services/email');

test('formatDate formats valid dates and handles invalid inputs gracefully', () => {
  const formatted = formatDate(new Date('2026-11-13T14:30:00Z'));
  assert.strictEqual(formatted, '2026-11-13 14:30:00');
  assert.strictEqual(formatDate(null), 'N/A');
  assert.strictEqual(formatDate('invalid-date'), 'N/A');
});

test('exportLeadsToExcelBuffer generates a valid Excel workbook with 11 columns and correct rows', async () => {
  const mockLeads = [
    {
      _id: '6733a1000000000000000001',
      createdAt: new Date(),
      companyName: 'Acme Test Corp',
      website: 'https://acme-test.example.com',
      email: 'hello@acme-test.example.com',
      industry: 'Software',
      location: 'Dhaka',
      productsServices: 'Cloud & AI SaaS',
      emailSent: true,
      auditId: {
        status: 'done',
        result: {
          overallScore: 88,
          grade: 'Strong'
        }
      }
    },
    {
      _id: '6733a1000000000000000002',
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      companyName: 'Beta Dynamics',
      website: 'https://beta.example.com',
      email: 'info@beta.example.com',
      industry: 'E-commerce',
      location: 'Chittagong',
      productsServices: 'Retail Platform',
      emailSent: false,
      auditId: {
        status: 'done',
        result: {
          overallScore: 54,
          grade: 'Basic'
        }
      }
    }
  ];

  const result = await exportLeadsToExcelBuffer(mockLeads);

  assert(result.buffer instanceof Buffer, 'Should return a Buffer');
  assert(result.buffer.length > 2000, 'Buffer should be a non-trivial Excel file');
  assert(result.filename.startsWith('fospertise-customer-leads-'), 'Filename should have standard prefix');
  assert(result.filename.endsWith('.xlsx'), 'Filename should have .xlsx extension');
  assert.strictEqual(result.totalCount, 2, 'Total count should be 2');
  assert.strictEqual(result.newThisWeek, 1, 'Only 1 lead was created in the last 7 days');
  assert.strictEqual(result.avgScore, 71, 'Average score of 88 and 54 should be 71');

  // Verify the Excel structure using ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  const worksheet = workbook.getWorksheet('Customer Leads & Audits');
  assert(worksheet, 'Worksheet Customer Leads & Audits must exist');
  assert.strictEqual(worksheet.rowCount, 3, 'Should have 1 header row + 2 data rows');
  assert.strictEqual(worksheet.columnCount, 11, 'Should have exactly 11 columns (Lead ID removed)');

  const headerRow = worksheet.getRow(1);
  assert.strictEqual(headerRow.getCell(1).value, 'Submission Date');
  assert.strictEqual(headerRow.getCell(2).value, 'Company Name');
  assert.strictEqual(headerRow.getCell(3).value, 'Website URL');
  assert.strictEqual(headerRow.getCell(4).value, 'Email Address');
  assert.strictEqual(headerRow.getCell(9).value, 'Overall Score');
  assert.strictEqual(headerRow.getCell(10).value, 'Grade');
  assert.strictEqual(headerRow.getCell(11).value, 'Report Emailed?');
  assert.strictEqual(headerRow.getCell(12).value, null, 'Lead ID column should no longer exist');
});

test('exportLeadsToExcelBuffer handles empty leads array without crashing', async () => {
  const result = await exportLeadsToExcelBuffer([]);

  assert(result.buffer instanceof Buffer, 'Should return a Buffer even when empty');
  assert.strictEqual(result.totalCount, 0);
  assert.strictEqual(result.newThisWeek, 0);
  assert.strictEqual(result.avgScore, null);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  const worksheet = workbook.getWorksheet('Customer Leads & Audits');
  assert.strictEqual(worksheet.rowCount, 1, 'Should have only 1 header row');
});

test('buildWeeklyExportEmailHtml renders statistics, filename, and brand info', () => {
  const html = buildWeeklyExportEmailHtml({
    filename: 'fospertise-customer-leads-2026-11-13.xlsx',
    totalCount: 42,
    newThisWeek: 8,
    avgScore: 79,
    dateStr: '2026-11-13'
  });

  assert(typeof html === 'string', 'Should return HTML string');
  assert(html.includes('42'), 'Should contain total count');
  assert(html.includes('+8'), 'Should contain new this week count');
  assert(html.includes('79'), 'Should contain avg score');
  assert(html.includes('fospertise-customer-leads-2026-11-13.xlsx'), 'Should contain filename');
  assert(html.includes('Weekly Customer Database Export'), 'Should contain heading');
});
