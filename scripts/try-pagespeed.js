const { getPageSpeed } = require('../src/services/pagespeed');

async function main() {
  const url = process.argv[2] || 'https://example.com';

  console.log(`\nTesting PageSpeed Insights v5 for: ${url}\n`);
  const startTime = Date.now();

  const result = await getPageSpeed(url);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('='.repeat(55));
  console.log(`  PageSpeed test completed in ${elapsed}s`);
  console.log('='.repeat(55));

  if (result.error) {
    console.error('\nPageSpeed Test Failed:');
    console.error(`  Error: ${result.error}\n`);
    return;
  }

  console.log('\n--- Category Scores (0-100) ---\n');
  console.log(`  Performance:    ${result.performance}`);
  console.log(`  SEO:            ${result.seo}`);
  console.log(`  Accessibility:  ${result.accessibility}`);
  console.log(`  Best Practices: ${result.bestPractices}`);

  console.log('\n--- Core Web Vitals & Metrics ---\n');
  console.log(`  LCP (Largest Contentful Paint): ${result.metrics.lcp || 'N/A'}`);
  console.log(`  CLS (Cumulative Layout Shift):  ${result.metrics.cls || 'N/A'}`);
  console.log(`  TBT (Total Blocking Time):       ${result.metrics.tbt || 'N/A'}`);
  console.log(`  FCP (First Contentful Paint):    ${result.metrics.fcp || 'N/A'}`);
  console.log(`  Speed Index:                    ${result.metrics.speedIndex || 'N/A'}`);

  console.log('\n--- Top Opportunities ---\n');
  if (result.opportunities.length === 0) {
    console.log('  No major savings opportunities found (page is fast!).');
  } else {
    result.opportunities.forEach((opp, i) => {
      console.log(`  ${i + 1}. ${opp.title} (${opp.savings})`);
    });
  }
  console.log('');
}

main().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
