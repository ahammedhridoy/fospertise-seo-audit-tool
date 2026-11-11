const fs = require('fs');
const path = require('path');
const { runAuditPipeline } = require('../src/jobs/runAudit');
const { closeBrowser } = require('../src/services/browser');
const { normalizeUrl } = require('../src/services/urlGuard');

async function main() {
  const sitesFilePath = path.resolve(__dirname, 'sites.json');
  let rawSites = [];

  try {
    if (fs.existsSync(sitesFilePath)) {
      const content = fs.readFileSync(sitesFilePath, 'utf8').trim();
      rawSites = content ? JSON.parse(content) : [];
    }
  } catch (err) {
    console.error(`Error reading ${sitesFilePath}:`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(rawSites) || rawSites.length === 0) {
    console.log('scripts/sites.json is empty. Please add site URLs to scripts/sites.json and rerun.');
    return;
  }

  console.log(`\n======================================================`);
  console.log(`Starting E2E Audit for ${rawSites.length} site(s)`);
  console.log(`======================================================\n`);

  for (let i = 0; i < rawSites.length; i++) {
    const item = rawSites[i];
    const url = typeof item === 'string' ? item : item.url;
    if (!url) continue;

    let normalizedUrl;
    let host;
    try {
      normalizedUrl = normalizeUrl(url);
      host = new URL(normalizedUrl).hostname;
    } catch (e) {
      console.log(`[${i + 1}/${rawSites.length}] ${url} | FAILED: Invalid URL (${e.message})`);
      continue;
    }

    const companyName =
      (typeof item === 'object' && item.companyName) ||
      host.replace(/^www\./, '').split('.')[0].toUpperCase();
    const productsServices =
      (typeof item === 'object' && item.productsServices) ||
      'Digital products, technology services, and web development';
    const industry = (typeof item === 'object' && item.industry) || 'Technology';
    const location = (typeof item === 'object' && item.location) || 'Global';

    process.stdout.write(`[${i + 1}/${rawSites.length}] Auditing ${normalizedUrl} ... `);
    const start = Date.now();

    try {
      const result = await runAuditPipeline({
        website: normalizedUrl,
        companyName,
        productsServices,
        industry,
        location,
        onProgress: (pct, stage) => {
          // Subtle in-place progress update if interactive terminal
          if (process.stdout.isTTY) {
            process.stdout.write(`\r[${i + 1}/${rawSites.length}] Auditing ${normalizedUrl} [${pct}%: ${stage}]... `);
          }
        }
      });

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      const warningsCount = (result.warnings || []).length;
      const pagesCount = (result.pagesCrawled || []).length;

      // Clear progress line
      if (process.stdout.isTTY) {
        process.stdout.write('\r\x1b[K');
      }

      console.log(
        `${normalizedUrl} | Score: ${result.overallScore}/100 | Grade: ${result.grade} | Time: ${elapsedSec}s | Pages: ${pagesCount} | Warnings: ${warningsCount}`
      );
    } catch (err) {
      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      if (process.stdout.isTTY) {
        process.stdout.write('\r\x1b[K');
      }
      console.log(`${normalizedUrl} | FAILED: ${err.message || 'Audit failed'} | Time: ${elapsedSec}s`);
    }
  }

  await closeBrowser();
  console.log(`\n======================================================`);
  console.log(`E2E Audit complete.`);
  console.log(`======================================================\n`);
}

main().catch(async (err) => {
  console.error('Fatal error in E2E runner:', err);
  await closeBrowser();
  process.exit(1);
});
