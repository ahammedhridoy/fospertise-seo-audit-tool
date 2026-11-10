const { crawlSite } = require('../src/services/crawler');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/try-crawl.js <url>');
    process.exit(1);
  }

  console.log(`\nCrawling: ${url}\n`);
  const start = Date.now();

  const { pages, errors } = await crawlSite(url);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('='.repeat(60));
  console.log(`  Crawl complete in ${elapsed}s`);
  console.log(`  Pages crawled: ${pages.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log('='.repeat(60));

  console.log('\n--- Pages ---\n');
  for (const page of pages) {
    console.log(`  URL:        ${page.url}`);
    console.log(`  Title:      ${page.title || '(none)'}`);
    console.log(`  Status:     ${page.status}`);
    console.log(`  Words:      ${page.wordCount}`);
    console.log(`  H1:         ${page.h1.join(', ') || '(none)'}`);
    console.log(`  Headings OK:${page.headingOrderOk ? ' yes' : ' NO'}`);
    console.log(`  Images:     ${page.imageCount} (${page.imagesWithAlt} with alt)`);
    console.log(`  JSON-LD:    ${page.jsonLd.length} blocks, ${page.jsonLdErrors} errors`);
    console.log(`  Lists:      ${page.listCount}  Tables: ${page.tableCount}`);
    console.log(`  Viewport:   ${page.hasViewport ? 'yes' : 'no'}`);
    console.log(`  Form:       ${page.hasForm ? 'yes' : 'no'}`);
    console.log(`  Phones:     ${page.phones.length > 0 ? page.phones.join(', ') : '(none)'}`);
    console.log(`  Emails:     ${page.emails.length > 0 ? page.emails.join(', ') : '(none)'}`);
    console.log(`  Int links:  ${page.internalLinks.length}  Ext links: ${page.externalLinks.length}`);
    console.log('');
  }

  if (errors.length > 0) {
    console.log('--- Errors ---\n');
    for (const err of errors) {
      console.log(`  ${err.url}`);
      console.log(`    → ${err.error}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error('Crawl script failed:', err.message);
  process.exit(1);
});
