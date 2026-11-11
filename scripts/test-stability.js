const { runAuditPipeline } = require('../src/jobs/runAudit');
const { clearCache } = require('../src/services/pagespeed');
const { closeBrowser } = require('../src/services/browser');

async function testSiteStability(targetUrl) {
  console.log(`\nTesting stability for: ${targetUrl} (2 consecutive runs, cache off)\n`);

  // Run 1
  clearCache();
  console.log('--- Starting Run 1 ---');
  const t1 = Date.now();
  const res1 = await runAuditPipeline({
    website: targetUrl,
    companyName: 'Example Domain',
    productsServices: 'Illustrative examples in documents and web testing',
    industry: 'Technology',
    location: 'Global',
    onProgress: (pct, stage) => process.stdout.write(`\rRun 1: ${pct}% - ${stage}...`)
  });
  console.log(`\nRun 1 completed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`Run 1 Score: ${res1.overallScore}/100 (${res1.grade})`);

  // Run 2 (clear cache)
  clearCache();
  console.log('\n--- Starting Run 2 ---');
  const t2 = Date.now();
  const res2 = await runAuditPipeline({
    website: targetUrl,
    companyName: 'Example Domain',
    productsServices: 'Illustrative examples in documents and web testing',
    industry: 'Technology',
    location: 'Global',
    onProgress: (pct, stage) => process.stdout.write(`\rRun 2: ${pct}% - ${stage}...`)
  });
  console.log(`\nRun 2 completed in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  console.log(`Run 2 Score: ${res2.overallScore}/100 (${res2.grade})`);

  // Compare categories
  console.log('\n================ SCORE COMPARISON ================');
  console.log(`Overall: Run 1 = ${res1.overallScore} | Run 2 = ${res2.overallScore} | Diff = ${Math.abs(res1.overallScore - res2.overallScore)} pts`);

  for (let i = 0; i < (res1.categories || []).length; i++) {
    const c1 = res1.categories[i];
    const c2 = res2.categories?.[i];
    const diff = Math.abs((c1.score || 0) - (c2?.score || 0));
    console.log(`- ${c1.label}: Run 1 = ${c1.score}/${c1.max} | Run 2 = ${c2?.score}/${c2?.max} | Diff = ${diff.toFixed(1)}`);
  }

  await closeBrowser();
  return { res1, res2, diff: Math.abs(res1.overallScore - res2.overallScore) };
}

testSiteStability('https://example.com')
  .then(({ diff }) => {
    if (diff <= 2) {
      console.log(`\nPASS: Score difference is ${diff} point(s) (within allowable <= 2 points tolerance).`);
      process.exit(0);
    } else {
      console.error(`\nFAIL: Score difference is ${diff} points (exceeds allowable 2 points tolerance).`);
      process.exit(1);
    }
  })
  .catch(async (err) => {
    console.error('Error during stability test:', err);
    await closeBrowser();
    process.exit(1);
  });

